(function (global) {
    'use strict';

    async function render(deps) {
        const {
            captureStrategyRequest,
            setButtonBusy,
            setTableMessage,
            fetchJson,
            getActiveStrategyId,
            commonAnalysisPath,
            isCurrentStrategyRequest,
            captureAnalysisCycle,
            escapeHtml,
            pill,
            formatNumber,
            toKorAction,
            translateReason,
            bindQueueButtons,
        } = deps;

        const request = captureStrategyRequest();
        setButtonBusy('btn-signals', true);
        setTableMessage('#table-signals tbody', 7, '\ubcf4\uc720 \uc885\ubaa9\uc744 \uc9c4\ub2e8\ud558\uace0 \uc788\uc2b5\ub2c8\ub2e4...');
        try {
            const strategyData = await fetchJson('/api/ai-strategies');
            const appliedStrategies = (strategyData.strategies || []).filter(
                (strategy) => strategy.selected && strategy.status === 'approved' && !strategy.independent_schedule
            );
            let data;
            if (appliedStrategies.length > 1) {
                const responses = await Promise.all(appliedStrategies.map(async (strategy) => {
                    const response = await fetchJson(`/api/signals?strategy_id=${encodeURIComponent(strategy.id)}`);
                    return (response.signals || []).map((signal) => ({
                        ...signal,
                        strategy_name: strategy.display_name || strategy.name || strategy.id,
                    }));
                }));
                data = { signals: responses.flat() };
            } else {
                data = await fetchJson(await commonAnalysisPath('/api/signals'));
                const strategy = appliedStrategies[0];
                if (strategy) {
                    data.signals = (data.signals || []).map((signal) => ({
                        ...signal,
                        strategy_name: strategy.display_name || strategy.name || strategy.id,
                    }));
                }
            }
            if (!isCurrentStrategyRequest(request)) return;
            captureAnalysisCycle(data);
            const tbody = document.querySelector('#table-signals tbody');
            tbody.innerHTML = '';
            if (!data.signals.length) {
                setTableMessage('#table-signals tbody', 7, '\ubcf4\uc720 \uc885\ubaa9\uc774 \uc5c6\uc2b5\ub2c8\ub2e4');
                return;
            }

            data.signals.forEach((row) => {
                const action = String(row.action || 'hold').toLowerCase();
                const kind = action === 'buy' ? 'buy' : (action === 'sell' ? 'sell' : 'hold');
                const queueButton = action === 'hold'
                    ? `<button type="button" class="button-ghost" disabled title="\uad00\ub9dd \uc2e0\ud638\uc774\ubbc0\ub85c \uc8fc\ubb38 \uc2e0\uccad\uc774 \uc5c6\uc2b5\ub2c8\ub2e4." style="opacity:0.3; cursor:not-allowed;">\ubcf4\uc720(\uad00\ub9dd)</button>`
                    : `<button type="button" class="button-ghost queue-order"
                    data-symbol="${escapeHtml(row.symbol)}"
                    data-name="${escapeHtml(row.name)}"
                    data-action="${escapeHtml(action)}"
                    data-qty="${Number(row.signal_qty || 0)}"
                    data-price="${Number(row.signal_price || 0)}"
                    data-reason="${escapeHtml(row.reason)}"
                    data-source="signal">\uc2b9\uc778\ub300\uae30</button>`;
                const reason = translateReason(row.reason);
                const tr = document.createElement('tr');
                tr.innerHTML = `
                <td>
                    <div class="symbol-name">${escapeHtml(row.name)}</div>
                    <div class="symbol-code">${escapeHtml(row.symbol)}</div>
                </td>
                <td>${pill(toKorAction(action), kind)}</td>
                <td>${pill(formatNumber(row.strategy_score), Number(row.strategy_score || 0) >= 5 ? 'buy' : 'hold')}</td>
                <td>${Number(row.signal_qty || 0).toLocaleString()}</td>
                <td>${formatNumber(row.rsi, 1)} / ${formatNumber(row.rsi2, 1)}</td>
                <td>${formatNumber(row.macd_hist, 2)}</td>
                <td>
                    <div class="time-muted">${escapeHtml(row.strategy_name || row.strategy_id || '')}</div>
                    <div class="reason-cell" title="${escapeHtml(reason)}">${escapeHtml(reason)}</div>
                    ${queueButton}
                </td>
            `;
                tbody.appendChild(tr);
            });
            bindQueueButtons();
        } catch (err) {
            setTableMessage('#table-signals tbody', 7, err.message);
        } finally {
            setButtonBusy('btn-signals', false);
        }
    }

    global.HanstockDashboardSignalsScreen = { render };
})(window);
