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
CANDIDATE_HISTORY_SCREEN_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-candidate-history-screen.js"
).read_text(encoding="utf-8")
RECONCILIATION_SCREEN_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-reconciliation-screen.js"
).read_text(encoding="utf-8")
OPEN_ORDERS_SCREEN_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-open-orders-screen.js"
).read_text(encoding="utf-8")
PERIODIC_PERFORMANCE_SCREEN_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-periodic-performance-screen.js"
).read_text(encoding="utf-8")
TRADE_CLEANUP_SCREEN_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-trade-cleanup-screen.js"
).read_text(encoding="utf-8")
TRADE_SYNC_SCREEN_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-trade-sync-screen.js"
).read_text(encoding="utf-8")
APPROVAL_QUEUE_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-approval-queue.js"
).read_text(encoding="utf-8")
RUNTIME_SCREEN_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-runtime-screen.js"
).read_text(encoding="utf-8")
CONFIG_SCREEN_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-config-screen.js"
).read_text(encoding="utf-8")
RISK_SCREEN_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-risk-screen.js"
).read_text(encoding="utf-8")
HOLDING_SUMMARY_SCREEN_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-holding-summary-screen.js"
).read_text(encoding="utf-8")
HOLDINGS_SCREEN_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-holdings-screen.js"
).read_text(encoding="utf-8")
HOLDING_STRATEGY_SUMMARY_SCREEN_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-holding-strategy-summary-screen.js"
).read_text(encoding="utf-8")
SIGNALS_SCREEN_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-signals-screen.js"
).read_text(encoding="utf-8")
WATCHLIST_SUMMARY_SCREEN_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-watchlist-summary-screen.js"
).read_text(encoding="utf-8")
OPTIMIZER_SCREEN_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-optimizer-screen.js"
).read_text(encoding="utf-8")
PORTFOLIO_CHART_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-portfolio-chart.js"
).read_text(encoding="utf-8")
PERFORMANCE_DETAIL_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-performance-detail.js"
).read_text(encoding="utf-8")
STRATEGY_LOOKUP_HISTORY_JS = (
    ROOT / "web" / "static" / "js" / "dashboard-strategy-lookup-history.js"
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

    def test_candidate_history_screen_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-candidate-history-screen.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardCandidateHistoryScreen", CANDIDATE_HISTORY_SCREEN_JS)
        self.assertIn("HanstockDashboardCandidateHistoryScreen.render", APP_JS)
        self.assertNotIn("const historyList = data.history || []", APP_JS)

    def test_reconciliation_screen_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-reconciliation-screen.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardReconciliationScreen", RECONCILIATION_SCREEN_JS)
        self.assertIn("HanstockDashboardReconciliationScreen.render", APP_JS)

    def test_open_orders_screen_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-open-orders-screen.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardOpenOrdersScreen", OPEN_ORDERS_SCREEN_JS)
        self.assertIn("HanstockDashboardOpenOrdersScreen.render", APP_JS)

    def test_periodic_performance_screen_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-periodic-performance-screen.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardPeriodicPerformanceScreen", PERIODIC_PERFORMANCE_SCREEN_JS)
        self.assertIn("HanstockDashboardPeriodicPerformanceScreen.render", APP_JS)

    def test_trade_cleanup_screen_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-trade-cleanup-screen.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardTradeCleanupScreen", TRADE_CLEANUP_SCREEN_JS)
        self.assertIn("HanstockDashboardTradeCleanupScreen.render", APP_JS)

    def test_trade_sync_screen_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-trade-sync-screen.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardTradeSyncScreen", TRADE_SYNC_SCREEN_JS)
        self.assertIn("HanstockDashboardTradeSyncScreen.render", APP_JS)

    def test_approval_queue_loader_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-approval-queue.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardApprovalQueue", APPROVAL_QUEUE_JS)
        self.assertIn("HanstockDashboardApprovalQueue.load", APP_JS)

    def test_runtime_screen_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-runtime-screen.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardRuntimeScreen", RUNTIME_SCREEN_JS)
        self.assertIn("HanstockDashboardRuntimeScreen.render", APP_JS)

    def test_config_screen_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-config-screen.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardConfigScreen", CONFIG_SCREEN_JS)
        self.assertIn("HanstockDashboardConfigScreen.render", APP_JS)

    def test_risk_screen_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-risk-screen.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardRiskScreen", RISK_SCREEN_JS)
        self.assertIn("HanstockDashboardRiskScreen.render", APP_JS)

    def test_holding_summary_screen_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-holding-summary-screen.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardHoldingSummaryScreen", HOLDING_SUMMARY_SCREEN_JS)
        self.assertIn("HanstockDashboardHoldingSummaryScreen.render", APP_JS)

    def test_holdings_screen_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-holdings-screen.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardHoldingsScreen", HOLDINGS_SCREEN_JS)
        self.assertIn("HanstockDashboardHoldingsScreen.render", APP_JS)

    def test_holding_strategy_summary_screen_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-holding-strategy-summary-screen.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardHoldingStrategySummaryScreen", HOLDING_STRATEGY_SUMMARY_SCREEN_JS)
        self.assertIn("HanstockDashboardHoldingStrategySummaryScreen.render", APP_JS)

    def test_signals_screen_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-signals-screen.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardSignalsScreen", SIGNALS_SCREEN_JS)
        self.assertIn("HanstockDashboardSignalsScreen.render", APP_JS)

    def test_watchlist_summary_screen_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-watchlist-summary-screen.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardWatchlistSummaryScreen", WATCHLIST_SUMMARY_SCREEN_JS)
        self.assertIn("HanstockDashboardWatchlistSummaryScreen.render", APP_JS)

    def test_optimizer_screen_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-optimizer-screen.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardOptimizerScreen", OPTIMIZER_SCREEN_JS)
        self.assertIn("HanstockDashboardOptimizerScreen.render", APP_JS)

    def test_portfolio_chart_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-portfolio-chart.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardPortfolioChart", PORTFOLIO_CHART_JS)
        self.assertIn("HanstockDashboardPortfolioChart.render", APP_JS)

    def test_performance_detail_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-performance-detail.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardPerformanceDetail", PERFORMANCE_DETAIL_JS)
        self.assertIn("HanstockDashboardPerformanceDetail.render", APP_JS)

    def test_strategy_lookup_history_isolated_from_app(self):
        module_tag = '<script src="/static/js/dashboard-strategy-lookup-history.js?v=1"></script>'
        app_tag = '<script src="/static/js/app.js?v=72"></script>'
        self.assertLess(TEMPLATE.index(module_tag), TEMPLATE.index(app_tag))
        self.assertIn("HanstockDashboardStrategyLookupHistory", STRATEGY_LOOKUP_HISTORY_JS)
        self.assertIn("HanstockDashboardStrategyLookupHistory.render", APP_JS)

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
