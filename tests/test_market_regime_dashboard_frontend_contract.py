import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = (ROOT / "web" / "templates" / "index.html").read_text(encoding="utf-8")
APP_JS = (ROOT / "web" / "static" / "js" / "app.js").read_text(encoding="utf-8")
MARKET_REGIME_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-market-regime.js"
).read_text(encoding="utf-8")
STRATEGY_AUDIT_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-strategy-audit.js"
).read_text(encoding="utf-8")
STRATEGY_AUDIT_SCREEN_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-strategy-audit-screen.js"
).read_text(encoding="utf-8")
AI_ALLOCATION_SCREEN_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-ai-allocation-screen.js"
).read_text(encoding="utf-8")
STYLE = (ROOT / "web" / "static" / "css" / "style.css").read_text(encoding="utf-8")


class MarketRegimeDashboardFrontendContractTests(unittest.TestCase):
    def test_market_regime_presentation_module_loads_before_app(self):
        module_tag = '<script src="/static/js/dashboard-market-regime.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardMarketRegime", MARKET_REGIME_JS)
        self.assertNotIn("const MARKET_REGIME_LABELS = {", APP_JS)

    def test_strategy_audit_helpers_load_before_app(self):
        module_tag = '<script src="/static/js/dashboard-strategy-audit.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardStrategyAudit", STRATEGY_AUDIT_JS)
        self.assertNotIn("function eventPayloadSummary(payload)", APP_JS)

    def test_strategy_audit_screen_isolated_from_app_state(self):
        module_tag = '<script src="/static/js/dashboard-strategy-audit-screen.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("getStrategyCatalog", STRATEGY_AUDIT_SCREEN_JS)
        self.assertNotIn("strategiesRes", APP_JS)

    def test_ai_allocation_screen_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-ai-allocation-screen.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardAiAllocationScreen", AI_ALLOCATION_SCREEN_JS)
        self.assertIn("data-source=", AI_ALLOCATION_SCREEN_JS)
        self.assertIn("ai-allocation", AI_ALLOCATION_SCREEN_JS)

    def test_dashboard_exposes_daily_market_regime_panel(self):
        required_markup = (
            'data-dashboard-tab="market-regime"',
            'id="dashboard-tab-market-regime"',
            'id="market-regime-summary"',
            'id="market-regime-summary-text"',
            'id="market-regime-action"',
            'id="market-regime-quality-note"',
            'id="market-regime-breadth-sentence"',
            'id="table-market-regime-indices"',
            'id="market-regime-breadth"',
            'id="market-regime-reasons"',
            'id="market-regime-warnings"',
            'id="market-regime-checklist"',
            'id="table-market-regime-history"',
        )
        for marker in required_markup:
            with self.subTest(marker=marker):
                self.assertIn(marker, TEMPLATE)

    def test_frontend_reads_all_market_regime_contracts(self):
        self.assertIn("fetchJson('/api/market-regime/current'", APP_JS)
        self.assertIn("fetchJson('/api/market-regime/history?days=30'", APP_JS)
        self.assertIn("fetchJson('/api/market-regime/diagnostics'", APP_JS)
        self.assertIn("postJson('/api/market-regime/refresh'", APP_JS)
        self.assertIn("Promise.all([", APP_JS)
        self.assertIn("MARKET_REGIME_GUIDE", APP_JS)
        self.assertIn("MARKET_REASON_LABELS", APP_JS)

    def test_easy_summary_keeps_detailed_evidence_available(self):
        self.assertIn("국내 시장, 지금 어떤 상태인가요?", TEMPLATE)
        self.assertIn("오늘의 대응", TEMPLATE)
        self.assertIn("상세 지표와 점검 결과 보기", TEMPLATE)
        self.assertIn("KOSPI·KOSDAQ 상세", TEMPLATE)
        self.assertIn("평소 대비 변동성 (1.0=평소)", APP_JS)

    def test_refresh_is_explicit_and_reports_busy_and_error_states(self):
        self.assertIn('id="btn-refresh-market-regime"', TEMPLATE)
        self.assertIn('id="market-regime-refresh-status"', TEMPLATE)
        self.assertIn('id="market-regime-error"', TEMPLATE)
        self.assertIn("async function refreshMarketRegimeData()", APP_JS)
        self.assertIn("setButtonBusy(button, true)", APP_JS)
        self.assertIn("데이터 다시 수집 실패", APP_JS)
        self.assertIn("addEventListener('click', refreshMarketRegimeData)", APP_JS)

    def test_market_regime_styles_include_quality_and_mobile_states(self):
        self.assertIn('.market-regime-hero[data-quality="good"]', STYLE)
        self.assertIn('.market-regime-hero[data-quality="degraded"]', STYLE)
        self.assertIn('.market-regime-hero[data-quality="insufficient"]', STYLE)
        self.assertIn(".market-regime-checklist", STYLE)
        self.assertIn("@media (max-width: 760px)", STYLE)


if __name__ == "__main__":
    unittest.main()
