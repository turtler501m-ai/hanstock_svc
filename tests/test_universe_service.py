import unittest
from unittest.mock import Mock

from src.strategy.universe_service import build_scan_universe


class UniverseServiceTests(unittest.TestCase):
    def test_monitor_has_priority_and_filters_held_and_excluded(self):
        api = Mock()
        logger = Mock()
        result = build_scan_universe(
            api,
            {"000660"},
            watchlist=["005930", "000660"],
            static_universe=["035420"],
            excluded_symbols=lambda: {"005930"},
            scan_size=10,
            monitor_symbols=lambda _: ["000660", "251270"],
            logger=logger,
        )

        self.assertEqual(result, ["251270"])
        api.fetch_volume_rank.assert_not_called()

    def test_volume_rank_falls_back_to_static_universe(self):
        api = Mock()
        api.fetch_volume_rank.return_value = []
        result = build_scan_universe(
            api,
            set(),
            watchlist=["005930"],
            static_universe=["035420", "005930"],
            excluded_symbols=lambda: set(),
            scan_size=3,
            monitor_symbols=lambda _: [],
            logger=Mock(),
        )

        self.assertEqual(result, ["005930", "035420"])
        api.fetch_volume_rank.assert_called_once_with(top_n=3)


if __name__ == "__main__":
    unittest.main()
