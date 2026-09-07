import unittest

from src.application.orders.realism_readiness import (
    build_internal_trading_realism_readiness,
)


class InternalTradingRealismReadinessTests(unittest.TestCase):
    def test_target_is_measurable_and_reset_to_95_percent(self):
        result = build_internal_trading_realism_readiness()

        self.assertEqual(result["target_pct"], 95)
        self.assertEqual(len(result["items"]), 20)
        self.assertEqual(result["current_pct"], 95.0)
        self.assertEqual(result["implementation_pct"], 95.0)
        self.assertTrue(result["code_target_achieved"])
        self.assertFalse(result["operational_validation_complete"])
        self.assertFalse(result["target_achieved"])
        self.assertEqual(result["status"], "implementation_complete_validation_pending")
        self.assertEqual([row["id"] for row in result["remaining"]], ["live_validation"])
        self.assertTrue(result["remaining"][0]["validation_required"])


if __name__ == "__main__":
    unittest.main()
