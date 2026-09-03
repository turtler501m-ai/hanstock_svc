import unittest
from types import SimpleNamespace

from src.strategy.profile_service import calculate_profile_inputs


class ProfileServiceTests(unittest.TestCase):
    def test_calculates_shared_indicator_bundle(self):
        result = calculate_profile_inputs(
            [1, 2, 3], [1, 2, 3], [0, 1, 2], [10, 20, 30],
            config=SimpleNamespace(
                trade_value_surge_ratio=1.5,
                first_wave_min_pct=3,
                first_wave_pullback_min_pct=2,
                first_wave_pullback_max_pct=12,
            ),
            calc_rsi=lambda prices, period: period,
            calc_sma=lambda prices, period: period * 10,
            calc_bollinger=lambda prices, period: (1, 2, 3),
            calc_macd=lambda prices: {"hist": 1},
            calc_atr=lambda highs, lows, prices: 2,
            moving_average_cross=lambda prices: {"golden_cross": False},
            relative_momentum=lambda prices: {"score": 1},
            trade_value_surge=lambda *args, **kwargs: {"matched": False},
            first_wave_pullback=lambda *args, **kwargs: {"matched": False},
        )
        self.assertEqual(result["current"], 3)
        self.assertEqual(result["previous"], 2)
        self.assertEqual(result["rsi14"], 14)
        self.assertEqual(result["atr_pct"], round(2 / 3 * 100, 2))


if __name__ == "__main__":
    unittest.main()
