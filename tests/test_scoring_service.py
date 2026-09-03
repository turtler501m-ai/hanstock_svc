import unittest
from types import SimpleNamespace

from src.strategy.scoring_service import score_default_strategy


class ScoringServiceTests(unittest.TestCase):
    def test_scores_momentum_and_volume_evidence(self):
        score, reasons = score_default_strategy(
            list(range(1, 81)), list(range(1, 81)), [10] * 79 + [20],
            current=80, previous=79, rsi14=40, rsi2=10, sma20=60, sma60=50, sma120=40,
            bb_lo=20, macd={"bull_cross": False, "hist": 1},
            ma_cross={"golden_cross": False, "dead_cross": False},
            momentum={"score": 2, "reasons": ["60d momentum"]}, atr_pct=4,
            value_surge={"matched": True, "ratio": 2.0},
            wave_pullback={"matched": False}, config=SimpleNamespace(rsi_buy=35),
            calc_rsi=lambda *_args: 20, calc_bollinger=lambda *_args: (10, 20, 30),
        )
        self.assertEqual(score, 12.0)
        self.assertIn("MACD positive", reasons)
        self.assertIn("20-day breakout with volume", reasons)
        self.assertIn("60d momentum", reasons)


if __name__ == "__main__":
    unittest.main()
