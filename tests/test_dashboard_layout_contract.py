import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = (ROOT / "web" / "templates" / "index.html").read_text(encoding="utf-8")
STYLE = (ROOT / "web" / "static" / "css" / "style.css").read_text(encoding="utf-8")
SCHEDULER_ROWS = (ROOT / "web" / "static" / "js" / "dashboard-scheduler-rows.js").read_text(encoding="utf-8")
SCHEDULER_ACTIONS = (ROOT / "web" / "static" / "js" / "dashboard-scheduler-actions.js").read_text(encoding="utf-8")
APP_JS = (ROOT / "web" / "static" / "js" / "app.js").read_text(encoding="utf-8")


class DashboardLayoutContractTests(unittest.TestCase):
    def test_desktop_navigation_is_horizontal_and_content_aligned(self):
        self.assertIn("@media (min-width: 769px)", STYLE)
        self.assertIn("flex-direction: row !important", STYLE)
        self.assertIn("position: static !important", STYLE)
        self.assertIn("margin-left: 0 !important", STYLE)
        self.assertIn("left: auto", STYLE)
        self.assertNotIn("margin-left: 190px", STYLE)
        self.assertNotIn("margin-left: 164px", STYLE)
        self.assertIn('href="/static/css/style.css?v=62"', TEMPLATE)

    def test_ai_strategy_workspace_uses_shared_layout_classes(self):
        self.assertIn('class="ai-strategy-header-actions"', TEMPLATE)
        self.assertIn('class="ai-strategy-table"', TEMPLATE)
        self.assertIn('class="strategy-events-table"', TEMPLATE)
        self.assertNotIn('id="btn-refresh-ai-strategies" style=', TEMPLATE)
        self.assertIn("min-width: 760px", STYLE)
        self.assertIn("box-shadow: inset 3px 0 #f97316", STYLE)
        self.assertIn("background: rgba(249, 115, 22, 0.14)", STYLE)
        self.assertIn('class="warning-note trade-sync-last-result"', TEMPLATE)
        self.assertIn('role="status" aria-live="polite"', TEMPLATE)
        self.assertIn(".performance-cashflow-form", STYLE)
        self.assertNotIn("                    .badge {", TEMPLATE)
        self.assertIn(".trade-sync-last-result[hidden]", STYLE)
        self.assertIn("#table-watchlist {", STYLE)
        self.assertIn("min-width: 1040px", STYLE)
        self.assertIn("outline: 2px solid #f97316 !important", STYLE)
        self.assertIn("watchlist-data-card", TEMPLATE)
        self.assertIn(".watchlist-table-scroll", STYLE)
        self.assertIn(".ai-strategy-create-form", STYLE)
        self.assertNotIn('id="form-add-ai-strategy" style=', TEMPLATE)

    def test_scheduler_running_panel_uses_hidden_state_consistently(self):
        self.assertIn('id="scheduler-running-panel" class="card glass panel-schedule-running schedule-running-panel" hidden', TEMPLATE)
        self.assertIn("panel.hidden = false", SCHEDULER_ACTIONS)
        self.assertIn("runningPanel.hidden = false", APP_JS)
        self.assertIn("runningPanel.hidden = true", APP_JS)
        self.assertNotIn("#table-watchlist thead th", TEMPLATE)
        self.assertNotIn(".switch-toggle { position: relative", TEMPLATE)
        self.assertNotIn("CSS styles specific to Plunge Bounce Strategy", TEMPLATE)
        self.assertIn(".pb-tabs-container", STYLE)

    def test_mobile_navigation_remains_bottom_navigation(self):
        self.assertIn("@media (max-width: 768px)", STYLE)
        self.assertIn("bottom: 0 !important", STYLE)
        self.assertIn("height: var(--bottom-nav-height) !important", STYLE)

    def test_dashboard_tabs_are_connected_to_panels(self):
        for tab_name in (
            "overview", "portfolio", "strategy", "watchlist", "ai-strategies",
            "market-regime", "schedule", "ai", "orders", "performance",
        ):
            self.assertIn(
                f'aria-controls="dashboard-tab-{tab_name}"',
                TEMPLATE,
            )

    def test_scheduler_rows_have_readable_fallback_text(self):
        for text in ("생성된 매매 계획이 없습니다.", "승인 대기 주문이 없거나 자동 승인이 취소되었습니다.", "오류 발생"):
            self.assertIn(text, SCHEDULER_ROWS)
        for mojibake in ("?앹꽦", "?뱀씤", "?ㅻ쪟"):
            self.assertNotIn(mojibake, SCHEDULER_ROWS)


if __name__ == "__main__":
    unittest.main()
