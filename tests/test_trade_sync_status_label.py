import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class TradeSyncStatusLabelTests(unittest.TestCase):
    def test_review_required_is_not_rendered_as_failure(self):
        source = (ROOT / "web/static/js/dashboard-trade-sync-screen.js").read_text(encoding="utf-8")
        self.assertIn("run.status === 'review_required'", source)
        self.assertIn("? '확인 필요'", source)


if __name__ == "__main__":
    unittest.main()
