import inspect
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from src.dashboard.routes import stock_plan


class DashboardRiskStatusTests(unittest.TestCase):
    def test_offline_without_snapshot_reports_unavailable(self):
        with patch.object(stock_plan.trader.config, "online_access_blocked", True), \
                patch.object(stock_plan, "snapshot_read_through", side_effect=lambda key, build: build()), \
                patch.object(stock_plan, "_get_api") as get_api:
            with self.assertRaises(HTTPException) as caught:
                inspect.unwrap(stock_plan.get_risk_status)()
        self.assertEqual(caught.exception.status_code, 503)
        get_api.assert_not_called()

    def test_offline_keeps_existing_risk_snapshot(self):
        with patch.object(stock_plan.trader.config, "online_access_blocked", True), \
                patch.object(stock_plan, "snapshot_read_through", return_value={"loss_halt": True}), \
                patch.object(stock_plan, "_get_api") as get_api:
            self.assertTrue(inspect.unwrap(stock_plan.get_risk_status)()["halted"])
        get_api.assert_not_called()
