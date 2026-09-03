import os
import unittest
from unittest.mock import Mock, patch

from src.broker.base import DomesticStockBroker
from src.broker.factory import create_domestic_stock_broker, selected_domestic_stock_broker
from src.broker.nhplug_adapter import NHPlugBrokerAdapter
from src.broker.models import OrderRequest, OrderSide, OrderStatus


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


if __name__ == "__main__":
    unittest.main()
