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

    def test_balance_reconciles_accepted_false_failed_order_without_old_overage(self):
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

        self.assertEqual(result["reconciled_count"], 1)
        with stock_order.trader.connect_db() as conn:
            rows = conn.execute(
                "SELECT qty, ok, order_status FROM trades ORDER BY id"
            ).fetchall()
        self.assertEqual(rows[-1], (1157, 1, "reconciled"))
        self.assertEqual(rows[-2], (160, 0, "failed"))


if __name__ == "__main__":
    unittest.main()
