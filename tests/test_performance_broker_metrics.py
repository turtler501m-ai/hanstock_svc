import unittest
from unittest.mock import MagicMock

from src.dashboard.routes.stock_performance import (
    _enrich_current_holding_change,
    _merge_current_broker_realized,
)


class PerformanceBrokerMetricsTests(unittest.TestCase):
    def test_quote_change_and_broker_sell_are_merged_into_today(self):
        api = MagicMock()
        api.get_quote.side_effect = [
            {"daily_change_rate": 1.0},
            {"daily_change_rate": -1.0},
        ]
        parsed = {
            "holdings": [
                {"symbol": "A", "value": 101, "daily_change_pct": 0},
                {"symbol": "B", "value": 99, "daily_change_pct": 0},
            ],
            "broker_sell_amount": 1_302_200,
            "broker_realized_pnl": -218_000,
        }
        _enrich_current_holding_change(api, parsed)
        result = {"daily": [], "monthly": []}
        _merge_current_broker_realized(result, parsed, "2026-09-08")

        self.assertEqual(parsed["holding_daily_change_pct"], 0.0)
        self.assertEqual(result["daily"][0]["realized_pnl"], -218_000)
        self.assertEqual(result["daily"][0]["cost_of_sold"], 1_520_200)
        self.assertEqual(result["daily"][0]["realized_pnl_rate"], -14.34)


if __name__ == "__main__":
    unittest.main()
