import unittest

from src.dashboard.services.env_service import account_format_warning


class EnvServiceTests(unittest.TestCase):
    def test_accepts_supported_namuh_account_lengths(self):
        for length in range(8, 13):
            with self.subTest(length=length):
                self.assertEqual(account_format_warning("1" * length), "")

    def test_rejects_account_lengths_outside_supported_range(self):
        self.assertEqual(account_format_warning("1" * 7), "Namuh account format is invalid")
        self.assertEqual(account_format_warning("1" * 13), "Namuh account format is invalid")

    def test_strips_display_separators(self):
        self.assertEqual(account_format_warning("5000-1002-915"), "")


if __name__ == "__main__":
    unittest.main()
