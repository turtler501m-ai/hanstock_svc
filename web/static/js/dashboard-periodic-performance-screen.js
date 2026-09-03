/* Periodic performance screen orchestration. Loaded before app.js. */
(function (global) {
    async function renderPeriodicPerformance(deps) {
        try {
            const periodicData = await deps.fetchJson(deps.performancePath('/api/performance/periodic'), 30000);
            periodicData.strategy_forward = [];
            deps.setPeriodicData(periodicData);
            const dailyButton = document.getElementById('btn-perf-daily');
            const monthlyButton = document.getElementById('btn-perf-monthly');
            if (dailyButton && !dailyButton.dataset.listenerAttached) {
                dailyButton.dataset.listenerAttached = 'true';
                dailyButton.addEventListener('click', () => deps.activateTab('daily', dailyButton, monthlyButton));
            }
            if (monthlyButton && !monthlyButton.dataset.listenerAttached) {
                monthlyButton.dataset.listenerAttached = 'true';
                monthlyButton.addEventListener('click', () => deps.activateTab('monthly', monthlyButton, dailyButton));
            }
            deps.updatePeriodicUi();
            try {
                const forwardData = await deps.fetchJson(deps.performancePath('/api/performance/forward'), 30000);
                periodicData.strategy_forward = [
                    ...(forwardData.account ? [forwardData.account] : []),
                    ...(forwardData.strategies || []),
                ];
                deps.renderForward(periodicData.strategy_forward);
            } catch (error) {
                console.error('Forward performance render failed:', error);
                const tbody = document.querySelector('#table-strategy-validation tbody');
                if (tbody) tbody.innerHTML = `<tr><td colspan="11">\uc804\ub7b5 \uc131\uacfc \uc870\ud68c \uc2e4\ud328: ${deps.escapeHtml(error.message)}</td></tr>`;
            }
        } catch (error) {
            console.error('Periodic performance render failed:', error);
        }
    }
    global.HanstockDashboardPeriodicPerformanceScreen = Object.freeze({ render: renderPeriodicPerformance });
}(window));
