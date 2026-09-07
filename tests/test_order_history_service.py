import unittest

from src.dashboard.services.order_history_service import (
    _history_fill_price,
    _history_remaining_qty,
    _history_row_to_trade,
    _normalize_history_cancellations,
)


class OrderHistoryServiceTests(unittest.TestCase):
    def test_parses_namuh_execution_price_and_remaining_quantity(self):
        row = {
            "cntr_uv": "0000026900",
            "ord_remnq": "0000000056",
        }

        self.assertEqual(_history_fill_price(row), 26900)
        self.assertEqual(_history_remaining_qty(row), 56)

    def test_malformed_history_row_is_safe(self):
        self.assertEqual(_history_remaining_qty(None), 0)

    def test_nhplug_raw_execution_fields_are_recognized(self):
        row = {"mkt_orr_no": "12", "iem_cd": "005930", "iem_nm": "Samsung",
               "sby_dit_cd_nm": "매도", "orr_dt": "20260907", "orr_tm": "100001",
               "orr_qty": 10, "tot_cns_qty": 10, "cns_avg_uit_pr": 70100}
        trade = _history_row_to_trade(row)
        self.assertEqual(trade["symbol"], "005930")
        self.assertEqual(trade["action"], "sell")
        self.assertEqual(trade["filled_qty"], 10)
        self.assertEqual(trade["filled_price"], 70100)
        self.assertEqual(trade["ts"], "2026-09-07 10:00:01")
        self.assertEqual(trade["order_status"], "filled")

    def test_cancellation_does_not_cross_order_dates(self):
        first = {"mkt_orr_no": "12", "orr_dt": "20260904"}
        second = {"mkt_orr_no": "12", "orr_dt": "20260907", "cor_can_dit_cd_nm": "정상"}
        cancel = {"mkt_orr_no": "13", "orr_dt": "20260907",
                  "org_mkt_orr_no": "12", "cor_can_dit_cd_nm": "취소"}
        self.assertEqual(_normalize_history_cancellations([first, second, cancel]),
                         [first, {**second, "cncl_yn": "Y"}])
        from src.dashboard.services.order_history_service import _history_order_is_canceled
        self.assertTrue(_history_order_is_canceled(
            _normalize_history_cancellations([first, second, cancel])[1]
        ))

    def test_order_price_is_not_execution_price(self):
        self.assertEqual(_history_fill_price({"ord_unpr": 70000}), 0)

    def test_folds_separate_namuh_cancellation_into_original_order(self):
        original = {"ord_no": "0035136", "ord_qty": "5", "cncl_yn": "N"}
        cancellation = {
            "ord_no": "0065539", "ori_ord": "0035136", "mdfy_cncl": "취소",
        }

        result = _normalize_history_cancellations([original, cancellation])

        self.assertEqual(result, [{**original, "cncl_yn": "Y"}])

    def test_keeps_unrelated_history_rows(self):
        history = [{"ord_no": "100", "ord_qty": "1"}]
        self.assertIs(_normalize_history_cancellations(history), history)

    def test_expired_order_with_remainder_is_canceled(self):
        row = {
            "ord_no": "100",
            "pdno": "005930",
            "sll_buy_dvsn_cd": "02",
            "ord_dt": "20260818",
            "ord_qty": "10",
            "cntr_qty": "4",
            "ord_remnq": "6",
        }

        self.assertEqual(_history_row_to_trade(row)["order_status"], "canceled")


if __name__ == "__main__":
    unittest.main()
