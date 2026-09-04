/* Configuration screen loading and form binding. Loaded before app.js. */
(function (global) {
    async function renderConfig(deps) {
        const config = await deps.fetchJson('/api/config');
        deps.setLatestConfig(config);
        deps.setText('val-account', config.namuh_account || '-');
        deps.renderSummary(config);
        const readiness = config.technical_strategy_readiness || {};
        const readinessItems = Array.isArray(readiness.items) ? readiness.items : [];
        const complete = readinessItems.filter((item) => item.complete).length;
        deps.setText('strategy-settings-status', readiness.complete ? '운영 준비 완료' : `확인 필요 · ${complete}/${readinessItems.length}`);
        const settings = document.getElementById('settings-grid');
        if (!settings) return;
        settings.innerHTML = deps.renderForm(config);
        const form = document.getElementById('strategy-settings-form');
        if (form) form.addEventListener('submit', deps.saveSettings);
    }
    global.HanstockDashboardConfigScreen = Object.freeze({ render: renderConfig });
}(window));
