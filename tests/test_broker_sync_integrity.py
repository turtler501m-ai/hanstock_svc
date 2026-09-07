import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from src.broker.nhplug_adapter import NHPlugBrokerAdapter
from src.broker.nhplug_client import NHPlugApiError, NHPlugPage, NHPlugRestClient
from src.dashboard.services import order_sync_service
from src.dashboard.services.balance_service import parse_balance


class BrokerSyncIntegrityTests(unittest.TestCase):
    def page(self, rows=(), *, cursor="", flag="", summary=None):
        return NHPlugPage({"Output_0": summary or {}, "Output_1": list(rows)},
                          {"cts": cursor, "cts_flag": flag})

    def test_balance_failure_after_first_page_is_not_success(self):
        client = Mock()
        client.post.side_effect = [self.page(cursor="next", flag="Y"),
                                   NHPlugApiError("unavailable")]
        with self.assertRaises(NHPlugApiError):
            NHPlugBrokerAdapter(client).fetch_balance()

    def test_balance_repeated_cursor_is_rejected(self):
        client = Mock()
        client.post.return_value = self.page(cursor="same", flag="Y")
        with self.assertRaisesRegex(RuntimeError, "Incomplete broker inquiry"):
            NHPlugBrokerAdapter(client).fetch_balance()
        self.assertEqual(client.post.call_count, 2)

    def test_missing_cursor_and_page_limit_are_rejected(self):
        for pages in ([self.page(flag="Y")],
                      [self.page(cursor="1", flag="Y"), self.page(cursor="2", flag="Y")]):
            with self.subTest(pages=len(pages)):
                client = Mock()
                client.post.side_effect = pages
                with self.assertRaisesRegex(RuntimeError, "Incomplete broker inquiry"):
                    NHPlugBrokerAdapter(client)._inquiry_pages("/test", {}, max_pages=2)

    def test_complete_balance_retains_all_raw_pages_and_first_summary(self):
        client = Mock()
        rows = [{"iem_cd": "000001", "itg_bnc_qty": 1},
                {"iem_cd": "000002", "itg_bnc_qty": 2}]
        client.post.side_effect = [self.page(rows[:1], cursor="next", flag="Y",
                                             summary={"tot_aet_amt": 123}),
                                   self.page(rows[1:], flag="N")]
        broker = NHPlugBrokerAdapter(client)
        with patch.object(broker, "fetch_sellable_quantity", return_value=0):
            balance = broker.fetch_balance()
        self.assertEqual(len(balance.holdings), 2)
        self.assertEqual(balance.total_equity, 123)
        self.assertEqual(balance.raw["Output_1"], rows)

    def test_trade_history_collects_every_page(self):
        client = Mock()
        rows = [{"mkt_orr_no": str(index), "iem_cd": "000001", "orr_qty": 2,
                 "tot_cns_qty": 2, "cns_avg_uit_pr": 100, "orr_dt": "20260907"}
                for index in (1, 2)]
        client.post.side_effect = [self.page(rows[:1], cursor="next", flag="Y"),
                                   self.page(rows[1:], flag="N")]
        result = NHPlugBrokerAdapter(client).fetch_trade_history("20260907", "20260907")
        self.assertEqual([row.order_id for row in result], ["1", "2"])
        self.assertEqual(client.post.call_args.kwargs, {"cts": "next", "cts_flag": "Y"})

    def test_zero_orderable_cash_is_authoritative(self):
        client = Mock()
        client.post.return_value = self.page(summary={
            "orr_pbl_amt1": 0, "orr_pbl_amt": 900, "nxt2_dd_dca": 0, "dca": 1000,
        })
        balance = NHPlugBrokerAdapter(client).fetch_balance()
        self.assertEqual(balance.orderable_cash, 0)
        self.assertEqual(balance.cash, 0)
        parsed = parse_balance({"output2": [{"dnca_tot_amt": 1000, "ord_psbl_cash": 0}]})
        self.assertEqual(parsed["orderable_cash"], 0)

    def test_single_order_snapshot_folds_separate_cancel_and_numeric_alias(self):
        client = Mock()
        client.post.return_value = self.page([
            {"mkt_orr_no": "12", "iem_cd": "005930", "orr_qty": 10,
             "tot_cns_qty": 4, "cns_avg_uit_pr": 70100},
            {"mkt_orr_no": "13", "org_mkt_orr_no": "12", "iem_cd": "005930",
             "orr_qty": 6, "tot_cns_qty": 0, "cor_can_dit_cd_nm": "취소"},
        ])
        snapshot = NHPlugBrokerAdapter(client).fetch_order_snapshot("0000012", "20260907")
        self.assertEqual(snapshot.status.value, "canceled")
        self.assertEqual(snapshot.filled_quantity, 4)
        self.assertEqual(snapshot.average_fill_price, 70100)

    def test_token_refresh_retries_original_body_and_allows_continuation(self):
        response = Mock(status_code=200, headers={"cts": "next", "cts_flag": "Y"})
        response.json.return_value = {"rsp_cd": "XA109", "Output_0": []}
        session = Mock()
        session.post.return_value = response
        with tempfile.TemporaryDirectory() as directory:
            client = NHPlugRestClient("app", "secret", session=session)
            client._token_cache_path = Path(directory) / "tokens.json"
            # The fixture never contains actual credentials.
            with patch.object(Path, "read_text", return_value=json.dumps({"other": ["fake-token", "date"]})), \
                    patch.object(Path, "write_text"), \
                    patch.object(client, "access_token", return_value="replacement"), \
                    patch.object(client, "_decode", side_effect=[
                        NHPlugApiError("IGW40043"), {"Output_0": []},
                    ]) as decode:
                body = {"act_no": "test", "orr_dt": "20260907"}
                page = client.post("/krstock/inquiry/v1/dailyOrderExecution", body)
            self.assertEqual(session.post.call_count, 2)
            self.assertEqual(session.post.call_args.kwargs["json"], {"Input_0": body})
            self.assertTrue(decode.call_args.kwargs["allow_continuation"])
            self.assertEqual(page.continuation["cts"], "next")

    def test_balance_changes_do_not_create_fills_or_cancellations(self):
        order_sync_service._refresh_dependencies()
        for side, current in (("buy", 20), ("sell", 0), ("sell", 7), ("sell", 10)):
            with self.subTest(side=side, current=current):
                trade = {"id": 1, "symbol": "000001", "action": side,
                         "broker_order_id": "order", "qty": 10, "pre_order_qty": 10,
                         "order_status": "submitted", "filled_qty": 0}
                trader = SimpleNamespace(update_trade_order_status=Mock())
                with patch.multiple(order_sync_service,
                                    _refresh_dependencies=Mock(), trader=trader,
                                    _get_balance_data=Mock(return_value={}),
                                    _parse_balance=Mock(return_value={"holdings": [{
                                        "symbol": "000001", "qty": current,
                                        "sellable_qty": current, "price": 999,
                                    }]}), _mirror_trade_to_unified_ledger=Mock()):
                    result = order_sync_service._sync_order_status_from_balance(
                        object(), [trade], close_unreserved_sells=True,
                    )
                self.assertFalse(result["ok"])
                self.assertEqual(result["updated_count"], 0)
                self.assertEqual(result["orders"][0]["sync_result"], "review_required")
                trader.update_trade_order_status.assert_not_called()

    def test_one_day_history_window_is_one_day(self):
        start, end = order_sync_service._order_history_window(1)
        self.assertEqual(start, end)


if __name__ == "__main__":
    unittest.main()
