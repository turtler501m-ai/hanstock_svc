import importlib.util
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


spec = importlib.util.spec_from_file_location(
    "deployment_smoke", Path(__file__).resolve().parents[1] / "tools/deployment-smoke.py"
)
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class DeploymentSmokeTests(unittest.TestCase):
    def run_verify(self, *, ready=True, periodic=None, body=None):
        operations = {
            "state": "ready", "operational_status": "healthy",
            "new_risk_allowed": False, "blockers": [], "schema": {"ready": ready},
        }
        resource = MagicMock()
        resource.__enter__.return_value = resource
        resource.status = 200
        resource.read.return_value = body if body is not None else (
            b'id="dashboard-main" id="btn-env-save" renderBalance .dashboard-tabs'
        )
        with patch.object(smoke, "fetch_json", side_effect=[
            {"ok": True}, operations,
            periodic if periodic is not None else {"daily": [], "monthly": []},
        ]), patch.object(smoke, "urlopen", return_value=resource):
            return smoke.verify("http://localhost:8011", 4)

    def test_accepts_empty_performance_and_orders_disabled(self):
        self.assertEqual(self.run_verify()["operations"]["state"], "ready")

    def test_rejects_unready_schema(self):
        with self.assertRaisesRegex(RuntimeError, "schema is not ready"):
            self.run_verify(ready=False)

    def test_rejects_malformed_performance(self):
        with self.assertRaisesRegex(RuntimeError, "daily/monthly"):
            self.run_verify(periodic={"daily": {}, "monthly": []})

    def test_rejects_missing_dashboard_html(self):
        with self.assertRaisesRegex(RuntimeError, "resource is missing"):
            self.run_verify(body=b"not found")
