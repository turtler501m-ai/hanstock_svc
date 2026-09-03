import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = (ROOT / "web" / "templates" / "index.html").read_text(encoding="utf-8")
STYLE = (ROOT / "web" / "static" / "css" / "style.css").read_text(encoding="utf-8")
SCHEDULER_ROWS = (ROOT / "web" / "static" / "js" / "dashboard-scheduler-rows.js").read_text(encoding="utf-8")


class DashboardLayoutContractTests(unittest.TestCase):
    def test_desktop_navigation_is_horizontal_and_content_aligned(self):
        self.assertIn("@media (min-width: 769px)", STYLE)
        self.assertIn("flex-direction: row !important", STYLE)
        self.assertIn("position: static !important", STYLE)
        self.assertIn("margin-left: 0 !important", STYLE)
        self.assertIn("left: auto", STYLE)
        self.assertNotIn("body.namuh-dashboard main {\n        margin-left: 190px;", STYLE)
        self.assertIn('href="/static/css/style.css?v=49"', TEMPLATE)

    def test_ai_strategy_workspace_uses_shared_layout_classes(self):
        self.assertIn('class="ai-strategy-header-actions"', TEMPLATE)
        self.assertIn('class="ai-strategy-table"', TEMPLATE)
        self.assertIn('class="strategy-events-table"', TEMPLATE)
        self.assertNotIn('id="btn-refresh-ai-strategies" style=', TEMPLATE)

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
