import sqlite3
import json
import tempfile
import unittest
from unittest.mock import patch

from src.dashboard.routes import stock_order
from src.application.orders.identity import broker_account_scope_key


class ReconciliationDashboardTests(unittest.TestCase):
    def setUp(self):
        self.original_db_path = stock_order.trader.config.trade_db_path
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        stock_order.trader.config.trade_db_path = f"{self.temp_dir.name}/trades.sqlite"
        stock_order.trader.init_db()

    def tearDown(self):
        stock_order.trader.config.trade_db_path = self.original_db_path
        self.temp_dir.cleanup()

    def insert_issue(self, *, broker_qty=7, internal_qty=10):
        account_key = broker_account_scope_key("KR")
        with stock_order.trader.connect_db() as conn:
            conn.execute(
                """INSERT INTO positions
                   (account_key,market,symbol,quantity,net_cash_flow,updated_at)
                   VALUES(?,'KR','005930',?,0,'2026-08-31')""",
                (account_key, internal_qty),
            )
            conn.execute(
                """INSERT INTO reconciliation_adjustments
                   (account_key,market,symbol,broker_qty,internal_qty,difference_qty,
                    reason,status,snapshot_json,created_at)
                   VALUES(?,'KR','005930',?,?,?,'balance mismatch','open','{}','2026-08-31')""",
                (account_key, broker_qty, internal_qty, broker_qty - internal_qty),
            )

    @staticmethod
    def apply_endpoint(payload):
        route = next(
            item for item in stock_order.router.routes
            if getattr(item, "path", "") == "/api/reconciliation/issues/apply-broker-balance"
        )
        endpoint = getattr(route.endpoint, "__wrapped__", route.endpoint)
        return endpoint(payload)

    def test_apply_revalidates_live_balance_and_restores_ready(self):
        self.insert_issue()
        with patch.object(stock_order, "_get_api", return_value=object()), patch.object(
            stock_order, "_get_balance_data", return_value={}
        ), patch.object(
            stock_order,
            "_parse_balance",
            return_value={"holdings": [{"symbol": "005930", "qty": 7}]},
        ), patch.object(stock_order, "_clear_balance_cache"):
            result = self.apply_endpoint({
                "confirmation": "APPLY_BROKER_BALANCE",
                "reason": "test operator review",
            })

        self.assertEqual(result["applied_count"], 1)
        self.assertTrue(result["health"]["new_risk_allowed"])
        with stock_order.trader.connect_db() as conn:
            position = conn.execute(
                "SELECT quantity FROM positions WHERE symbol='005930'"
            ).fetchone()[0]
            issue_status = conn.execute(
                "SELECT status FROM reconciliation_adjustments"
            ).fetchone()[0]
        self.assertEqual(position, 7)
        self.assertEqual(issue_status, "resolved")

    def test_apply_refreshes_stale_recorded_broker_quantity(self):
        self.insert_issue(broker_qty=7)
        with patch.object(stock_order, "_get_api", return_value=object()), patch.object(
            stock_order, "_get_balance_data", return_value={}
        ), patch.object(
            stock_order,
            "_parse_balance",
            return_value={"holdings": [{"symbol": "005930", "qty": 8}]},
        ):
            result = self.apply_endpoint({
                "confirmation": "APPLY_BROKER_BALANCE",
                "reason": "test operator review",
            })

        self.assertEqual(result["refreshed_count"], 1)
        self.assertEqual(result["applied_count"], 1)
        with stock_order.trader.connect_db() as conn:
            self.assertEqual(
                conn.execute("SELECT quantity FROM positions WHERE symbol='005930'").fetchone()[0],
                8,
            )
            self.assertEqual(
                conn.execute(
                    "SELECT COUNT(*) FROM reconciliation_adjustments WHERE status='open'"
                ).fetchone()[0],
                0,
            )

    def test_balance_does_not_promote_accepted_false_failed_orders(self):
        accepted = {
            "rt_cd": "1",
            "rsp_cd": "10000",
            "rsp_msg": "\ubaa8\uc758\ud22c\uc790 \ub9e4\uc218\uc8fc\ubb38\uc774\uc644\ub8cc\ub418\uc5c8\uc2b5\ub2c8\ub2e4.",
            "output": {"ODNO": "8"},
        }
        with stock_order.trader.connect_db() as conn:
            for ts, qty, order_id in (
                ("2026-09-03 15:00:36", 160, "302"),
                ("2026-09-04 08:57:57", 1157, "8"),
            ):
                conn.execute(
                    """INSERT INTO trades
                       (ts,symbol,name,action,qty,price,ok,env,broker_order_id,
                        order_status,filled_qty,broker_result)
                       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (ts, "001800", "test", "buy", qty, 1000, 0,
                     stock_order.trader.config.trading_env, order_id, "failed", 0,
                     json.dumps(accepted, ensure_ascii=False)),
                )

        result = stock_order._reconcile_ambiguous_orders_from_balance({
            "001800": {"qty": 1157, "price": 1000},
        })

        self.assertEqual(result["reconciled_count"], 0)
        with stock_order.trader.connect_db() as conn:
            rows = conn.execute(
                "SELECT qty, ok, order_status FROM trades ORDER BY id"
            ).fetchall()
        self.assertEqual(rows[-1], (1157, 0, "failed"))
        self.assertEqual(rows[-2], (160, 0, "failed"))

    def test_unknown_orders_are_reported_only_for_current_account(self):
        from src.application.orders.models import OrderIntent
        from src.application.orders.repository import OrderLedgerRepository

        ledger = OrderLedgerRepository(stock_order.trader.connect_db)
        current = broker_account_scope_key("KR")
        for account in (current, "other-account"):
            ledger.create(OrderIntent(
                client_order_key=account, correlation_id=account, account_key=account,
                symbol="005930", side="buy", quantity=10,
            ), initial_status="broker_unknown")
        result = stock_order._reconcile_unified_unknown_orders_from_balance({
            "005930": {"qty": 10, "price": 70000},
        })
        self.assertEqual(result["reconciled_count"], 0)
        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(result["items"][0]["sync_result"], "review_required")
        self.assertEqual(len(ledger.list_orders(statuses=("broker_unknown",))), 2)
        with stock_order.trader.connect_db() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM fills").fetchone()[0], 0)

    def test_apply_never_changes_another_accounts_issue(self):
        self.insert_issue()
        with stock_order.trader.connect_db() as conn:
            conn.execute(
                """INSERT INTO positions VALUES('other-account','KR','005930',99,0,'2026-09-07')"""
            )
            conn.execute(
                """INSERT INTO reconciliation_adjustments
                   (account_key,market,symbol,broker_qty,internal_qty,difference_qty,
                    reason,status,snapshot_json,created_at)
                   VALUES('other-account','KR','005930',50,99,-49,'other','open','{}','2026-09-07')"""
            )
        with patch.object(stock_order, "_get_api", return_value=object()), patch.object(
            stock_order, "_get_balance_data", return_value={}
        ), patch.object(stock_order, "_parse_balance", return_value={
            "holdings": [{"symbol": "005930", "qty": 7}],
        }), patch.object(stock_order, "_clear_balance_cache"):
            result = self.apply_endpoint({"confirmation": "APPLY_BROKER_BALANCE", "reason": "test"})
        self.assertEqual(result["applied_count"], 1)
        with stock_order.trader.connect_db() as conn:
            self.assertEqual(conn.execute(
                "SELECT quantity FROM positions WHERE account_key='other-account'"
            ).fetchone()[0], 99)
            self.assertEqual(conn.execute(
                "SELECT status FROM reconciliation_adjustments WHERE account_key='other-account'"
            ).fetchone()[0], "open")

    def test_old_unified_only_order_is_polled_and_filled_once(self):
        from unittest.mock import Mock
        from src.application.orders.models import OrderIntent
        from src.application.orders.repository import OrderLedgerRepository
        from src.dashboard.services import order_sync_service

        ledger = OrderLedgerRepository(stock_order.trader.connect_db)
        order = ledger.create(OrderIntent(
            client_order_key="old", correlation_id="old", account_key=broker_account_scope_key("KR"),
            symbol="005930", side="buy", quantity=10, broker_order_id="321",
            broker_order_date="2026-08-03",
        ), initial_status="broker_unknown")
        api = Mock()
        row = {"odno": "321", "pdno": "005930", "sll_buy_dvsn_cd": "02",
               "ord_dt": "20260803", "ord_qty": "10", "tot_ccld_qty": "10",
               "avg_prvs": "70100", "rmn_qty": "0"}
        api.get_trade_history.side_effect = lambda start, end: [row] if start == "20260803" else []
        result = order_sync_service._sync_order_status_from_history(api, days=1)
        self.assertEqual(result["updated_count"], 1)
        self.assertIn(("20260803", "20260803"), [call.args for call in api.get_trade_history.call_args_list])
        self.assertLessEqual(api.get_trade_history.call_count, 2)
        self.assertEqual(ledger.get(order["id"])["status"], "filled")
        order_sync_service._sync_order_status_from_history(api, days=1)
        with stock_order.trader.connect_db() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM fills").fetchone()[0], 1)

    def test_broker_history_import_materializes_position_once(self):
        from src.dashboard.services import order_sync_service

        history = [{"odno": "777", "pdno": "005930", "sll_buy_dvsn_cd": "02",
                    "ord_dt": "20260907", "ord_qty": "10", "tot_ccld_qty": "10",
                    "avg_prvs": "70100", "rmn_qty": "0"}]
        for _ in range(2):
            order_sync_service._sync_filled_trades_from_history(object(), history=history)
        with stock_order.trader.connect_db() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0], 1)
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM fills").fetchone()[0], 1)
            self.assertEqual(conn.execute("SELECT quantity FROM positions").fetchone()[0], 10)

    def test_history_without_execution_price_does_not_materialize_fill(self):
        from src.dashboard.services import order_sync_service

        history = [{"mkt_orr_no": "778", "iem_cd": "005930", "sby_dit_cd_nm": "매도",
                    "orr_dt": "20260907", "orr_qty": 10, "tot_cns_qty": 10,
                    "ord_unpr": 70100}]
        result = order_sync_service._sync_filled_trades_from_history(object(), history=history)
        self.assertEqual(result["items"][0]["sync_result"], "review_required")
        with stock_order.trader.connect_db() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM fills").fetchone()[0], 0)
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
