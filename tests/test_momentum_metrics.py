import unittest

from src.strategy.momentum_metrics import period_return, relative_momentum_score, volatility


class MomentumMetricsTests(unittest.TestCase):
    def test_period_return_uses_completed_lookback(self):
        self.assertEqual(period_return([100, 110, 120], 2), 20.0)
        self.assertEqual(period_return([0, 110, 120], 2), 0.0)

    def test_relative_momentum_score_reports_returns_and_reasons(self):
        prices = [100.0] * 121
        prices[-61:] = [100.0 + index * 0.2 for index in range(61)]
        result = relative_momentum_score(prices)
        self.assertIn("return_60d", result)
        self.assertIsInstance(result["reasons"], list)

    def test_volatility_requires_a_full_window(self):
        self.assertEqual(volatility([100.0] * 20), 0.0)
        self.assertEqual(volatility([100.0] * 21), 0.0)


if __name__ == "__main__":
    unittest.main()
