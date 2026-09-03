from pathlib import Path
import unittest

from src.dashboard.settings_schema import ENV_FIELD_MAP


ROOT = Path(__file__).resolve().parents[1]


class HanstockServiceBoundaryTests(unittest.TestCase):
    def test_dashboard_exposes_only_requested_navigation(self):
        html = (ROOT / "web" / "templates" / "index.html").read_text(encoding="utf-8")
        tabs = [
            'data-dashboard-tab="overview"',
            'data-dashboard-tab="portfolio"',
            'data-dashboard-tab="watchlist"',
            'data-dashboard-tab="ai-strategies"',
            'data-dashboard-tab="market-regime"',
            'data-dashboard-tab="schedule"',
            'data-dashboard-tab="ai"',
            'data-dashboard-tab="performance"',
        ]
        self.assertEqual(8, sum(html.count(tab) for tab in tabs))
        self.assertNotIn('href="/mistock"', html)
        self.assertNotIn('href="/ai-stock"', html)
        self.assertNotIn('href="/narrative-momentum"', html)

    def test_settings_are_domestic_only(self):
        forbidden_prefixes = ("MISTOCK_", "KIWOOM_US_", "BYBIT_", "LS_")
        self.assertFalse(any(key.startswith(forbidden_prefixes) for key in ENV_FIELD_MAP))

    def test_vm_service_uses_isolated_home(self):
        unit = (ROOT / "scripts" / "vm" / "hanstock-svc.service").read_text(encoding="utf-8")
        self.assertIn("WorkingDirectory=/home/ubuntu/hanstock_svc", unit)
        self.assertIn("127.0.0.1", unit)
        self.assertIn("--port 8011", unit)
        self.assertNotIn("hanstock_kw", unit)

    def test_tracked_python_has_no_mistock_imports(self):
        offenders = []
        for path in (ROOT / "src").rglob("*.py"):
            text = path.read_text(encoding="utf-8")
            if "src.mistock" in text:
                offenders.append(str(path.relative_to(ROOT)))
        self.assertEqual([], offenders)

    def test_dashboard_badges_match_isolated_port(self):
        for name in ("index.html", "env_settings.html"):
            html = (ROOT / "web" / "templates" / name).read_text(encoding="utf-8")
            self.assertIn("PORT 8011", html)
            self.assertNotIn("PORT 8001", html)

    def test_market_regime_cron_uses_tracked_python_entrypoint(self):
        script = (ROOT / "scripts" / "vm" / "install-market-regime-preflight-cron.sh").read_text(
            encoding="utf-8"
        )
        self.assertIn(".venv/bin/python -m src.market_regime preflight", script)
        self.assertNotIn("market-regime-preflight.sh", script)


if __name__ == "__main__":
    unittest.main()
