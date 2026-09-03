import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_JS = (ROOT / "web" / "static" / "js" / "app.js").read_text(encoding="utf-8")
FRONTEND_JS = APP_JS + "\n" + "\n".join(
    path.read_text(encoding="utf-8")
    for path in sorted((ROOT / "web" / "static" / "js").glob("dashboard-*.js"))
)
SETTINGS_SCHEMA_JS = (ROOT / "web" / "static" / "js" / "dashboard-strategy-settings-schema.js").read_text(encoding="utf-8")
COMMON_ANALYSIS_JS = (
    ROOT / "web" / "static" / "js" / "common-analysis.js"
).read_text(encoding="utf-8")
INDEX_HTML = (ROOT / "web" / "templates" / "index.html").read_text(encoding="utf-8")


class CommonDashboardFrontendContractTests(unittest.TestCase):
    def test_strategy_switch_generation_guards_slow_analysis_responses(self):
        self.assertIn("strategyRequestGeneration += 1", COMMON_ANALYSIS_JS)
        self.assertIn("isCurrentStrategyRequest(request)", COMMON_ANALYSIS_JS)
        self.assertIn("analysisCyclePromises = new Map()", COMMON_ANALYSIS_JS)

    def test_analysis_refresh_runs_candidates_before_signals_and_plan(self):
        start = COMMON_ANALYSIS_JS.index("async function startCommonAnalysisRefresh()")
        end = COMMON_ANALYSIS_JS.index("function invalidateCommonTabRefreshes()", start)
        body = COMMON_ANALYSIS_JS[start:end]
        self.assertLess(
            body.index("await renderCandidates({ refresh: true })"),
            body.index("Promise.all([renderSignals(), renderExecutionPlan()])"),
        )

    def test_isolated_strategy_buttons_are_not_disabled_by_common_scheduler(self):
        start = APP_JS.index("function disableTriggerButtons(disabled)")
        end = APP_JS.index("function copySchedulerLog", start)
        body = APP_JS[start:end]
        self.assertNotIn("btn-pb-run", body)
        self.assertNotIn("btn-ha-run", body)

    def test_orders_show_strategy_and_performance_has_explicit_scope(self):
        self.assertIn('<th>전략</th>', INDEX_HTML)
        self.assertIn('id="select-performance-scope"', INDEX_HTML)
        self.assertIn("row.order_classification_label", FRONTEND_JS)
        self.assertIn("approval-classification-badge", FRONTEND_JS)
        self.assertIn("'수동 주문'", FRONTEND_JS)


    def test_performance_tab_exposes_local_trade_cleanup(self):
        self.assertIn('id="table-trade-cleanup"', INDEX_HTML)
        self.assertIn("async function renderTradeCleanup()", FRONTEND_JS)
        self.assertIn("'/api/trades/local-cleanup?limit=200'", FRONTEND_JS)
        self.assertIn("`/api/trades/local/${tradeId}?confirm=true`", FRONTEND_JS)

    def test_performance_tab_exposes_market_context_strategy_validation_and_sorting(self):
        self.assertIn("보유주식 당일 등락", INDEX_HTML)
        self.assertIn("KOSPI 대비", FRONTEND_JS)
        self.assertIn("KOSDAQ 대비", FRONTEND_JS)
        self.assertIn("holding_change_symbol_count", FRONTEND_JS)
        self.assertIn("성과 등락", INDEX_HTML)
        self.assertIn("코스피 (등락)", INDEX_HTML)
        self.assertIn("코스닥 (등락)", INDEX_HTML)
        self.assertNotIn("코스피 변동성", INDEX_HTML)
        self.assertNotIn("코스닥 변동성", INDEX_HTML)
        self.assertIn("코스피 등락 (%)", FRONTEND_JS)
        self.assertIn("코스닥 등락 (%)", FRONTEND_JS)
        self.assertIn('id="table-strategy-validation"', INDEX_HTML)
        self.assertIn("strategy_name", FRONTEND_JS)
        self.assertIn("sortable-header", FRONTEND_JS)
        self.assertIn("data-sort-key", FRONTEND_JS)
        self.assertIn("function renderPeriodicCanvasFallback(canvas, dataList)", FRONTEND_JS)
        self.assertIn("using the built-in canvas renderer", FRONTEND_JS)

    def test_performance_tab_exposes_forward_returns_and_manual_review(self):
        self.assertIn("전략별 모의성과 및 수동 검증", INDEX_HTML)
        self.assertIn("/api/performance/forward", FRONTEND_JS)
        self.assertIn("function renderStrategyForwardPerformance(items)", FRONTEND_JS)
        self.assertIn("item.excess_vs_kospi_pct", FRONTEND_JS)
        self.assertIn("strategy-review-decision", FRONTEND_JS)
        self.assertIn("자동매매 상태는 변경되지 않았습니다", FRONTEND_JS)
        self.assertIn("Forward performance render failed", FRONTEND_JS)
        self.assertIn("qualitySummary", FRONTEND_JS)
        self.assertIn('title="${escapeHtml(qualityDetail)}"', FRONTEND_JS)
        self.assertIn("거래비용과 계좌 입출금이 확인되지 않은 결과는 추정치", INDEX_HTML)

    def test_trade_sync_result_lists_every_processed_item(self):
        self.assertIn('id="table-trade-sync-items"', INDEX_HTML)
        self.assertIn('id="table-trade-sync-runs"', INDEX_HTML)
        self.assertIn("run.sync_items", FRONTEND_JS)
        self.assertIn("result.runs", FRONTEND_JS)
        self.assertIn("trade-sync-run-button", FRONTEND_JS)
        self.assertIn("run.status === 'running'", FRONTEND_JS)
        self.assertIn("/api/trades/sync/runs/", FRONTEND_JS)
        self.assertIn("동기화 전체 항목 보기", INDEX_HTML)
        self.assertIn("details.hidden = false", FRONTEND_JS)

    def test_trade_sync_continues_and_refreshes_across_tab_changes(self):
        self.assertIn("startTradeSyncPolling()", APP_JS)
        self.assertIn("tradeSyncPollInterval = setInterval(poll, 3000)", APP_JS)
        self.assertIn("result.status === 'running'", APP_JS)
        self.assertIn("백그라운드에서 시작했습니다", APP_JS)

    def test_trade_sync_history_status_is_scoped_inside_run_renderer(self):
        trade_sync = (ROOT / "web/static/js/dashboard-trade-sync-screen.js").read_text(encoding="utf-8")
        start = trade_sync.index("function renderTradeSyncResult")
        body = trade_sync[start:]
        runs_map = body.index("runs.map")
        self.assertGreater(body.index("const status", runs_map), runs_map)

    def test_holdings_tab_has_refresh_control(self):
        self.assertIn(
            'data-dashboard-tab="portfolio">보유종목</button>',
            INDEX_HTML,
        )
        self.assertIn('id="btn-refresh-holdings"', INDEX_HTML)
        self.assertIn("await renderBalance()", APP_JS)

    def test_holdings_tab_exposes_broker_authoritative_sync(self):
        self.assertIn('id="btn-sync-holdings"', INDEX_HTML)
        self.assertIn("async function startBrokerHoldingsSync()", APP_JS)
        self.assertIn("postJson('/api/trades/sync', {})", APP_JS)
        self.assertIn(
            "btnSyncHoldings.addEventListener('click', startBrokerHoldingsSync)",
            APP_JS,
        )

    def test_orders_tab_exposes_open_order_cancel_and_full_refresh(self):
        self.assertIn('id="table-open-orders"', INDEX_HTML)
        self.assertIn('id="btn-refresh-open-orders"', INDEX_HTML)
        self.assertIn('id="btn-sync-order-holdings"', INDEX_HTML)
        self.assertIn("const ACTIVE_ORDER_STATUSES", FRONTEND_JS)
        self.assertIn("async function renderOpenOrders()", FRONTEND_JS)
        self.assertIn("`/api/orders/${orderId}/cancel`", FRONTEND_JS)
        self.assertIn("async function waitForCanceledOrder", FRONTEND_JS)
        self.assertIn("`/api/orders/${orderId}`", FRONTEND_JS)
        self.assertIn("renderOpenOrders(),", FRONTEND_JS)

    def test_orders_tab_exposes_reconciliation_details_and_safe_apply(self):
        self.assertIn('id="table-reconciliation-issues"', INDEX_HTML)
        self.assertIn('id="btn-apply-broker-balance"', INDEX_HTML)
        self.assertIn('id="btn-resolve-all-reconciliation"', INDEX_HTML)
        self.assertIn("async function renderReconciliationIssues()", FRONTEND_JS)
        self.assertIn("async function applyBrokerBalanceReconciliation(options = {})", FRONTEND_JS)
        self.assertIn("async function resolveAllReconciliationIssues()", FRONTEND_JS)
        self.assertIn("전체 불일치 해결 1/2", FRONTEND_JS)
        self.assertIn("전체 불일치 해결 2/2", FRONTEND_JS)
        self.assertIn("/api/reconciliation/issues?status=open", FRONTEND_JS)
        self.assertIn("/api/reconciliation/issues/apply-broker-balance", FRONTEND_JS)
        self.assertIn("confirmation: 'APPLY_BROKER_BALANCE'", FRONTEND_JS)

    def test_holdings_tab_exposes_strategy_value_loss_summary_and_filters(self):
        self.assertIn('id="table-holding-strategies"', INDEX_HTML)
        self.assertIn('id="holding-attribution-coverage"', INDEX_HTML)
        self.assertIn('id="holding-loss-list"', INDEX_HTML)
        self.assertIn('id="select-holding-strategy-filter"', INDEX_HTML)
        self.assertIn('id="select-holding-pnl-filter"', INDEX_HTML)
        self.assertIn("<th>손익 상태</th>", INDEX_HTML)
        self.assertIn("function renderHoldingStrategySummary(balance)", FRONTEND_JS)
        self.assertIn("balance.strategy_summary || []", FRONTEND_JS)
        self.assertIn("/api/holdings/strategy-sell", FRONTEND_JS)
        self.assertIn("/api/holdings/strategy-sell-all", FRONTEND_JS)
        self.assertIn("holdingStrategyFilter === 'all'", FRONTEND_JS)
        self.assertIn("holdingPnlFilter === 'all'", FRONTEND_JS)

    def test_sell_all_does_not_implicitly_activate_kill_switch(self):
        self.assertIn(
            "postJson('/api/holdings/sell-all', { halt_new_buys: false })",
            APP_JS,
        )
        self.assertNotIn(
            "postJson('/api/holdings/sell-all', { halt_new_buys: true })",
            APP_JS,
        )

    def test_scheduler_checklist_uses_persisted_schedule_registrations(self):
        scheduler_renderer = (ROOT / "web/static/js/dashboard-scheduler-strategy-checklist.js").read_text(encoding="utf-8")
        self.assertNotIn("fetchJson('/api/ai-strategies')", scheduler_renderer)
        self.assertIn("row.strategy_id", scheduler_renderer)
        self.assertNotIn("narrative_momentum_strategy", scheduler_renderer)
        self.assertIn("strategy.lastErrors", scheduler_renderer)
        self.assertIn("최근 실패", scheduler_renderer)

    def test_scheduler_summary_tracks_approval_success_and_failure(self):
        summary_module = (ROOT / "web/static/js/dashboard-scheduler-summary.js").read_text(encoding="utf-8")
        self.assertIn('id="sched-result-success-cnt"', INDEX_HTML)
        self.assertIn("summaryCounts.success_count", summary_module)
        self.assertIn("sched-result-success-cnt", summary_module)

    def test_scheduler_details_preserve_exact_error_messages(self):
        scheduler_renderer = (ROOT / "web/static/js/dashboard-scheduler-rows.js").read_text(encoding="utf-8")
        self.assertIn("row.message", scheduler_renderer)
        self.assertIn("row.response_msg", scheduler_renderer)
        self.assertIn("approvalErrors.forEach", scheduler_renderer)
        self.assertNotIn("cleanMsg.substring", scheduler_renderer)

    def test_scheduler_plan_zero_values_have_semantic_labels(self):
        formatters = (ROOT / "web/static/js/dashboard-scheduler-formatters.js").read_text(encoding="utf-8")
        self.assertIn("function planQuantity(deps, row)", formatters)
        self.assertIn("function planPrice(deps, row)", formatters)
        self.assertIn("return '시장가'", formatters)
        self.assertIn("return '수량 미산출'", formatters)
        self.assertIn("보유 ${deps.formatNumber(holding)} 주", formatters)
        self.assertIn("현재가 ${deps.formatNumber(current)} 원", formatters)
        self.assertIn("planQuantity", formatters)
        self.assertIn("planPrice", formatters)
        self.assertNotIn("${formatNumber(row.qty || row.signal_qty)}", APP_JS)
        self.assertNotIn("${formatNumber(row.price || row.signal_price)} 원", APP_JS)

    def test_scheduler_approval_rejection_is_not_rendered_as_failure(self):
        formatters = (ROOT / "web/static/js/dashboard-scheduler-formatters.js").read_text(encoding="utf-8")
        self.assertIn("function approvalStatus(status)", formatters)
        self.assertIn("rejected: { label: '거절'", formatters)
        self.assertIn("broker_unknown: { label: '브로커 확인 필요'", formatters)
        self.assertNotIn("pill(isSuccess ? '성공' : '실패'", formatters)

    def test_overview_strategy_settings_are_grouped_and_readiness_is_collapsible(self):
        settings_screen = (ROOT / "web/static/js/dashboard-strategy-settings-screen.js").read_text(encoding="utf-8")
        self.assertIn("function strategySettingGroups(config)", APP_JS)
        self.assertIn("HanstockDashboardStrategySettingsSchema.groups", APP_JS)
        self.assertIn("id: 'entry'", SETTINGS_SCHEMA_JS)
        self.assertIn("id: 'exit'", SETTINGS_SCHEMA_JS)
        self.assertIn("id: 'candidate'", SETTINGS_SCHEMA_JS)
        self.assertIn("id: 'risk'", SETTINGS_SCHEMA_JS)
        self.assertIn('class="strategy-settings-shell"', settings_screen)
        self.assertIn('class="strategy-readiness-details"', settings_screen)
        self.assertIn("고정 손절과 진입 이후 최고가 기준", SETTINGS_SCHEMA_JS)
        self.assertIn("전략 설정 저장", settings_screen)

    def test_watchlist_exposes_summary_policy_and_filters(self):
        self.assertIn('id="watchlist-total-count"', INDEX_HTML)
        self.assertIn('id="watchlist-sector-summary"', INDEX_HTML)
        self.assertIn('id="form-watchlist-policy"', INDEX_HTML)
        self.assertIn('id="num-watchlist-min-price"', INDEX_HTML)
        self.assertIn('value="5000"', INDEX_HTML)
        self.assertIn('id="select-watchlist-policy-filter"', INDEX_HTML)
        self.assertIn("function renderWatchlistSummary(data)", FRONTEND_JS)
        self.assertIn("'/api/watchlist/policy'", FRONTEND_JS)
        self.assertIn("row.policy_status === policyFilter", FRONTEND_JS)

    def test_schedule_tab_groups_overview_settings_execution_and_results(self):
        self.assertIn('class="schedule-overview-grid"', INDEX_HTML)
        self.assertIn('id="sched-overview-run-state"', INDEX_HTML)
        self.assertIn('id="sched-overview-schedule-state"', INDEX_HTML)
        self.assertIn('class="schedule-runtime-details"', INDEX_HTML)
        self.assertIn('class="schedule-mode-card is-safe"', INDEX_HTML)
        self.assertIn('class="schedule-mode-card is-auto"', INDEX_HTML)
        self.assertIn('class="schedule-mode-card is-execute"', INDEX_HTML)
        self.assertIn('class="schedule-result-metrics"', INDEX_HTML)
        self.assertEqual(INDEX_HTML.count('id="btn-run-analysis-only"'), 1)
        self.assertEqual(INDEX_HTML.count('id="btn-run-daily-auto"'), 1)
        self.assertEqual(INDEX_HTML.count('id="btn-run-execute"'), 1)
        self.assertIn("runStateEl.textContent", FRONTEND_JS)
        self.assertIn("scheduleStateEl.textContent", FRONTEND_JS)
        self.assertIn('class="scheduler-strategy-option"', FRONTEND_JS)


if __name__ == "__main__":
    unittest.main()
