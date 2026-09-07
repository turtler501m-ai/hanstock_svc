import unittest

from src.strategy.technical_backtest import run_technical_walk_forward


class TechnicalBacktestRealityTests(unittest.TestCase):
    def test_signal_never_observes_the_execution_bar(self):
        observed_lengths = []

        def profile(prices, _highs, _volumes):
            observed_lengths.append(len(prices))
            return {"score": 0, "sma_dead_cross": False}

        prices = [100.0] * 90
        result = run_technical_walk_forward(
            prices, prices, [1000.0] * 90,
            profile_builder=profile, warmup=60, folds=1,
        )

        self.assertTrue(result["ok"])
        self.assertEqual(observed_lengths[0], 60)
        self.assertTrue(result["execution_model"]["lookahead_protected"])
        self.assertEqual(result["execution_model"]["signal_lag_bars"], 1)


if __name__ == "__main__":
    unittest.main()
