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

    def test_intrabar_stop_and_gap_are_counted(self):
        def profile(prices, _highs, _volumes):
            # Enter once, then remain neutral; the execution bar itself must
            # still trigger a stop from OHLC data.
            return {"score": 5 if len(prices) == 60 else 0, "sma_dead_cross": False}

        prices = [100.0] * 60 + [100.0] * 20 + [94.0, 100.0]
        highs = [100.0] * 60 + [100.0] * 20 + [94.0, 100.0]
        opens = [100.0] * 80 + [94.0, 100.0]
        lows = [100.0] * 80 + [93.0, 100.0]
        result = run_technical_walk_forward(
            prices, highs, [1000.0] * len(prices),
            profile_builder=profile, warmup=60, folds=1,
            opens=opens, lows=lows, stop_loss_pct=5.0,
        )

        self.assertTrue(result["ok"])
        self.assertGreaterEqual(result["execution_model"]["stop_fill_counts"]["gap"], 1)


if __name__ == "__main__":
    unittest.main()
