/* Periodic performance screen orchestration. Loaded before app.js. */
(function (global) {
    function renderBrokerReconciliation(data, deps) {
        const container = document.getElementById('performance-broker-reconciliation');
        if (!container) return;
        const item = data && data.broker_reconciliation;
        if (!item) {
            container.hidden = true;
            container.textContent = '';
            return;
        }
        const difference = Number(item.realized_pnl_difference || 0);
        const matched = item.status === 'matched';
        container.hidden = false;
        container.classList.toggle('success-note', matched);
        container.innerHTML = matched
            ? `증권사 당일 실현손익과 로컬 체결 원장이 일치합니다. (${deps.formatCurrency(Number(item.broker_realized_pnl || 0))})`
            : `증권사 당일 실현손익으로 교정했습니다. 로컬 ${deps.formatCurrency(Number(item.local_realized_pnl || 0))} · 증권사 ${deps.formatCurrency(Number(item.broker_realized_pnl || 0))} · 차이 ${deps.formatCurrency(difference)}`;
    }

    async function renderPeriodicPerformance(deps) {
        try {
            const periodicData = await deps.fetchJson(deps.performancePath('/api/performance/periodic'), 30000);
            periodicData.strategy_forward = [];
            deps.setPeriodicData(periodicData);
            renderBrokerReconciliation(periodicData, deps);
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
                if (deps.setStatus) deps.setStatus(`전략 성과 조회 실패: ${error.message}`);
            }
        } catch (error) {
            console.error('Periodic performance render failed:', error);
            const tbody = document.querySelector('#table-periodic-performance tbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="10">성과 조회 실패: ${deps.escapeHtml(error.message)}</td></tr>`;
            }
            if (deps.setStatus) deps.setStatus(`기간별 성과 조회 실패: ${error.message}`);
        }
    }
    global.HanstockDashboardPeriodicPerformanceScreen = Object.freeze({ render: renderPeriodicPerformance });
}(window));
