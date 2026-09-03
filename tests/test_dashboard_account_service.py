import threading
import unittest
from unittest.mock import Mock

from src.dashboard.services.account_service import get_balance_data


class DashboardAccountServiceTests(unittest.TestCase):
    def test_fresh_cache_skips_broker_and_marks_cache_fresh(self):
        api = Mock()
        cached = {"cached": True}
        fresh = {"fresh": True}

        result = get_balance_data(
            api,
            allow_cache=True,
            balance_cache_ttl_seconds=30,
            fetch_timeout_seconds=1,
            cache_lock=threading.Lock(),
            load_cache=lambda: cached,
            cache_age=lambda _: 2,
            mark_cache_fresh=lambda _: fresh,
            parse_balance=Mock(),
            save_cache=Mock(),
        )

        self.assertIs(result, fresh)
        api.get_balance.assert_not_called()

    def test_invalid_live_balance_falls_back_to_cache(self):
        api = Mock()
        api.get_balance.return_value = {"bad": True}
        cached = {"cached": True}
        loads = iter([cached, cached, cached])
        parse = Mock(side_effect=ValueError("invalid balance"))

        result = get_balance_data(
            api,
            allow_cache=True,
            balance_cache_ttl_seconds=0,
            fetch_timeout_seconds=1,
            cache_lock=threading.Lock(),
            load_cache=lambda: next(loads),
            cache_age=lambda _: None,
            mark_cache_fresh=Mock(),
            parse_balance=parse,
            save_cache=Mock(),
            recoverable_errors=(ValueError,),
        )

        self.assertEqual(result, cached)
        parse.assert_called_once_with({"bad": True})


if __name__ == "__main__":
    unittest.main()
