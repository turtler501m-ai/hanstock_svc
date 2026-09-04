import os
import tempfile
import unittest
from unittest.mock import Mock, patch

from src.broker.base import DomesticStockBroker
from src.broker.factory import create_domestic_stock_broker, selected_domestic_stock_broker
from src.broker.nhplug_adapter import NHPlugBrokerAdapter
from src.broker.models import CancelOrderRequest, OrderRequest, OrderSide, OrderStatus
from src.broker.nhplug_client import NHPlugRestClient


class BrokerContractTests(unittest.TestCase):
    def test_factory_defaults_to_namuh(self):
        broker = create_domestic_stock_broker(client=Mock())
        self.assertIsInstance(broker, NHPlugBrokerAdapter)
        self.assertIsInstance(broker, DomesticStockBroker)

    def test_factory_uses_injected_nhplug_client(self):
        client = Mock()
        broker = create_domestic_stock_broker(client=client, notify_errors=True)
        self.assertIs(broker.client, client)

    def test_selected_broker_rejects_unknown_value(self):
        with self.assertRaisesRegex(ValueError, "Unsupported domestic stock broker"):
            selected_domestic_stock_broker("unknown")

    def test_selected_broker_reads_environment(self):
        with patch.dict(os.environ, {"DOMESTIC_STOCK_BROKER": "NAMUH"}):
            self.assertEqual(selected_domestic_stock_broker(), "namuh")

    def test_factory_builds_nhplug_adapter_from_injected_transport(self):
        client = Mock()
        broker = create_domestic_stock_broker(
            "namuh", client=client, order_submission_enabled=True
        )
        self.assertEqual(broker.broker_name, "namuh")
        self.assertIs(broker.client, client)
        self.assertTrue(broker.order_submission_enabled)

    def test_factory_rejects_missing_namuh_credentials(self):
        settings = Mock(
            nhplug_environment="mock",
            trading_env="demo",
            nhplug_app_key="",
            nhplug_app_secret="",
            nhplug_account="",
        )
        with self.assertRaisesRegex(ValueError, "app key, app secret, and account are required"):
            create_domestic_stock_broker("namuh", settings=settings)

    def test_factory_rejects_namuh_and_application_environment_mismatch(self):
        settings = Mock(
            nhplug_environment="real",
            trading_env="demo",
            nhplug_app_key="key",
            nhplug_app_secret="secret",
        )
        with self.assertRaisesRegex(ValueError, "must match TRADING_ENV"):
            create_domestic_stock_broker("namuh", settings=settings)
    @unittest.skip("legacy transport fixture removed")
    def test_removed_adapter_normalizes_balance_and_retains_raw(self):
        client = Mock()
        client.get_balance.return_value = {
            "output1": [{"pdno": "005930", "prdt_name": "삼성전자", "hldg_qty": "3", "ord_psbl_qty": "2", "pchs_avg_pric": "70000", "prpr": "71000", "evlu_amt": "213000"}],
            "output2": [{"dnca_tot_amt": "1000000", "tot_evlu_amt": "1213000", "scts_evlu_amt": "213000"}],
        }
        balance = NHPlugBrokerAdapter(client).fetch_balance()
        self.assertEqual(balance.cash, 1_000_000)
        self.assertEqual(balance.holdings[0].symbol, "005930")
        self.assertEqual(balance.holdings[0].sellable_quantity, 2)
        self.assertEqual(balance.raw["output1"][0]["pdno"], "005930")

    @unittest.skip("legacy transport fixture removed")
    def test_removed_adapter_normalizes_order_result(self):
        client = Mock()
        client.place_order.return_value = {"rt_cd": "0", "msg1": "주문 접수", "output": {"ODNO": "12345"}}
        result = NHPlugBrokerAdapter(client).submit_order(OrderRequest("005930", OrderSide.BUY, 2, 70000))
        self.assertTrue(result.success)
        self.assertEqual(result.broker_order_id, "12345")
        self.assertEqual(result.status, OrderStatus.SUBMITTED)
        client.place_order.assert_called_once_with("005930", "buy", 70000, 2)

    def test_namuh_quote_contract(self):
        client = Mock()
        client.post.return_value = {"Output_0": {"iem_cd": "005930", "stck_prpr": "71000"}}
        quote = NHPlugBrokerAdapter(client).fetch_quote("005930")
        self.assertEqual(quote.current_price, 71000)

    def test_namuh_cancel_sends_numeric_market_order_number(self):
        client = Mock()
        client.post.return_value = {"Output_0": {}, "rsp_cd": "00000", "rsp_msg": "취소 접수"}
        broker = NHPlugBrokerAdapter(client, account="demo", order_submission_enabled=True)

        broker.submit_cancellation(CancelOrderRequest("0000000548", "069620", 20))

        body = client.post.call_args.args[1]
        self.assertEqual(body["org_mkt_orr_no"], 548)

    def test_namuh_trade_history_accepts_mock_output_zero(self):
        client = Mock()
        client.account = "demo"
        client.post.return_value = type("Page", (), {"data": {
            "Output_0": [{"itg_orr_no": 548, "iem_cd": "069620", "orr_qty": 20,
                           "tot_cns_qty": 0, "ny_cns_qty": 20}],
        }})()
        history = NHPlugBrokerAdapter(client, account="demo").fetch_trade_history(
            "2026-09-04", "2026-09-04"
        )
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0].order_id, "548")

    def test_namuh_balance_contract_uses_settlement_quantity_and_total_assets(self):
        client = Mock()
        client.account = "demo"
        client.post.return_value = type("Page", (), {"data": {
            "Output_0": {
                "dca": 500000000,
                "tot_aet_amt": 499936330,
                "tot_eal_amt": 18664150,
                "tot_eal_pls": -26850,
                "orr_pbl_amt1": 453384370,
            },
            "Output_1": [{
                "iem_nm": "테스트", "iem_cd": "005930", "itg_bnc_qty": 0,
                "ny_stl_qty": 10, "rsdl_qty": 10, "phs_pr": 70000,
                "now_pr": 71000, "eal_amt": 710000, "eal_pls_amt": 10000,
            }],
        }})()
        balance = NHPlugBrokerAdapter(client).fetch_balance()
        self.assertEqual(balance.total_equity, 499936330)
        self.assertEqual(balance.stock_value, 710000)
        self.assertEqual(balance.holdings[0].quantity, 10)
        self.assertEqual(balance.orderable_cash, 453384370)

    def test_namuh_legacy_balance_serializes_whole_numeric_strings(self):
        client = Mock()
        client.account = "demo"
        client.post.return_value = type("Page", (), {"data": {
            "Output_0": {"dca": 100.0, "tot_aet_amt": 100.0, "orr_pbl_amt1": 100.0},
            "Output_1": [],
        }})()
        value = NHPlugBrokerAdapter(client, account="demo").get_balance()
        self.assertEqual(value["output2"][0]["dnca_tot_amt"], "100")
        self.assertEqual(value["output2"][0]["tot_evlu_amt"], "100")

    def test_namuh_balance_facade_retains_complete_broker_response(self):
        client = Mock()
        client.account = "demo"
        raw = {
            "Output_0": {"tot_aet_amt": 1000, "future_summary_field": "kept"},
            "Output_1": [{
                "iem_cd": "005930", "iem_nm": "삼성전자", "itg_bnc_qty": 1,
                "now_pr": 70000, "future_holding_field": "also-kept",
            }],
            "rsp_cd": "00000",
        }
        client.post.return_value = type("Page", (), {"data": raw})()

        result = NHPlugBrokerAdapter(client).get_balance()

        self.assertEqual(result["_broker_response"], raw)

    def test_nhplug_token_cache_survives_new_client_instance(self):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"access_token": "persisted-token", "expires_in": 86400}
        session = Mock()
        session.post.return_value = response
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ, {"NHPLUG_TOKEN_CACHE_FILE": os.path.join(directory, "token.json")}
        ):
            NHPlugRestClient.clear_token_cache()
            first = NHPlugRestClient("app", "secret", session=session)
            self.assertEqual(first.access_token(), "persisted-token")
            NHPlugRestClient._tokens.clear()
            second = NHPlugRestClient("app", "secret", session=session)
            self.assertEqual(second.access_token(), "persisted-token")
            session.post.assert_called_once()


if __name__ == "__main__":
    unittest.main()
