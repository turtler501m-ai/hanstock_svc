import unittest
import time
from unittest.mock import MagicMock, patch

from src.dashboard.routes import stock_performance
from src.dashboard.routes.stock_performance import (
    _enrich_current_holding_change,
    _merge_current_broker_realized,
)


class PerformanceBrokerMetricsTests(unittest.TestCase):
    def test_quote_change_and_broker_sell_are_merged_into_today(self):
        api = MagicMock()
        parsed = {
            "holdings": [
                {"symbol": "A", "value": 101, "daily_change_pct": 0},
                {"symbol": "B", "value": 99, "daily_change_pct": 0},
            ],
            "broker_sell_amount": 1_302_200,
            "broker_realized_pnl": -218_000,
        }
        with patch.object(stock_performance, "_HOLDING_CHANGE_CACHE", {
            "A": (time.monotonic(), 1.0), "B": (time.monotonic(), -1.0),
        }):
            _enrich_current_holding_change(api, parsed)
        result = {"daily": [], "monthly": []}
        reconciliation = _merge_current_broker_realized(result, parsed, "2026-09-08")

        self.assertEqual(parsed["holding_daily_change_pct"], 0.0)
        self.assertEqual(result["daily"][0]["realized_pnl"], -218_000)
        self.assertEqual(result["daily"][0]["cost_of_sold"], 1_520_200)
        self.assertEqual(result["daily"][0]["realized_pnl_rate"], -14.34)
        self.assertEqual(result["monthly"][0]["realized_pnl"], -218_000)
        self.assertEqual(result["monthly"][0]["cost_of_sold"], 1_520_200)
        self.assertEqual(result["monthly"][0]["realized_pnl_rate"], -14.34)
        self.assertEqual(reconciliation["status"], "adjusted")
        self.assertEqual(reconciliation["broker_realized_pnl"], -218_000)
        self.assertEqual(reconciliation["realized_pnl_difference"], -218_000)

    def test_broker_daily_correction_updates_month_by_delta(self):
        result = {
            "daily": [{
                "period": "2026-09-08", "sell_amount": 120_000,
                "realized_pnl": 20_000, "cost_of_sold": 100_000,
                "realized_pnl_rate": 20.0,
            }],
            "monthly": [{
                "period": "2026-09", "sell_amount": 620_000,
                "realized_pnl": 70_000, "cost_of_sold": 550_000,
                "realized_pnl_rate": 12.73,
            }],
        }

        _merge_current_broker_realized(
            result,
            {"broker_sell_amount": 150_000, "broker_realized_pnl": 30_000},
            "2026-09-08",
        )

        self.assertEqual(result["daily"][0]["realized_pnl"], 30_000)
        self.assertEqual(result["monthly"][0]["sell_amount"], 650_000)
        self.assertEqual(result["monthly"][0]["realized_pnl"], 80_000)
        self.assertEqual(result["monthly"][0]["cost_of_sold"], 570_000)
        self.assertEqual(result["monthly"][0]["realized_pnl_rate"], 14.04)


if __name__ == "__main__":
    unittest.main()
