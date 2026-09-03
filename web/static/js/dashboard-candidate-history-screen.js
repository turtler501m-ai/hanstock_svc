/* Candidate history screen orchestration. Loaded before app.js. */
(function (global) {
    async function renderCandidateHistory(deps) {
        try {
            const data = await deps.fetchJson(
                deps.withActiveStrategy('/api/candidates/history', { limit: 50 }),
                30000
            );
            const tbody = document.querySelector('#table-candidates-history tbody');
            if (!tbody) return;
            tbody.innerHTML = '';
            const historyList = data.history || [];
            if (!historyList.length) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #94a3b8;">\ud3ec\ucc29\ub41c \ub9e4\uc218\ud6c4\ubcf4 \uae30\ub85d\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.</td></tr>';
                return;
            }
            historyList.forEach((item) => {
                const rsi = item.rsi != null ? `RSI ${Number(item.rsi).toFixed(1)}` : '';
                const rsi2 = item.rsi2 != null ? `RSI2 ${Number(item.rsi2).toFixed(1)}` : '';
                const macd = item.macd_hist != null ? `MACD ${Number(item.macd_hist).toFixed(2)}` : '';
                const sma20 = item.sma20 || 0;
                const sma60 = item.sma60 || 0;
                const sma = sma20 > 0 && sma60 > 0
                    ? (sma20 > sma60 ? '\ub2e8\uae30\u2191\uc911\uae30\uc120 \uc704' : '\ub2e8\uae30\u2193\uc911\uae30\uc120 \uc544\ub798')
                    : '';
                const indicators = [rsi, rsi2, macd, sma].filter(Boolean).join(' | ') || '-';
                const reasons = (item.reasons || '').split(',').map(deps.strategyReasonLabel).join(' \u00b7 ');
                const environment = item.env === 'real' ? deps.pill('\uc2e4\uc804', 'sell') : deps.pill('\ubaa8\uc758', 'hold');
                const tr = document.createElement('tr');
                tr.innerHTML = `<td><strong>${deps.escapeHtml(item.scanned_at)}</strong></td><td><span class="symbol-name">${deps.escapeHtml(item.name || item.symbol)}</span><span class="symbol-code">${item.symbol}</span></td><td>${deps.pill(deps.formatNumber(item.score, 2), item.score >= 3 ? 'buy' : 'warn')}</td><td>${deps.formatCurrency(item.price)}</td><td><small style="color: #94a3b8;">${deps.escapeHtml(indicators)}</small></td><td><div class="reason-cell" title="${deps.escapeHtml(reasons)}">${deps.escapeHtml(reasons)}</div></td><td>${environment}</td><td><button type="button" class="button-ghost delete-candidate-history" data-id="${item.id}" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.2); padding: 4px 8px; font-size: 0.8rem; height: auto; min-height: auto;">\uc0ad\uc81c</button></td>`;
                tbody.appendChild(tr);
            });
            tbody.querySelectorAll('.delete-candidate-history').forEach((button) => {
                button.addEventListener('click', async () => {
                    const id = button.dataset.id;
                    if (!id || !confirm('\uc774 \ub9e4\uc218\ud6c4\ubcf4 \ud3ec\ucc29 \uae30\ub85d\uc744 \ub370\uc774\ud130\ubca0\uc774\uc2a4\uc5d0\uc11c \uc0ad\uc81c\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?')) return;
                    try {
                        const result = await deps.deleteJson(`/api/candidates/history/${id}`);
                        if (result.ok) {
                            deps.setStatus('\ub9e4\uc218\ud6c4\ubcf4 \ud3ec\ucc29 \uae30\ub85d\uc774 \uc131\uacf5\uc801\uc73c\ub85c \uc0ad\uc81c\ub418\uc5c8\uc2b5\ub2c8\ub2e4.', true);
                            await deps.reload();
                        }
                    } catch (error) {
                        console.error('Failed to delete candidate history', error);
                        alert(`\uc0ad\uc81c \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4: ${error.message}`);
                    }
                });
            });
        } catch (error) {
            console.error('Failed to fetch candidate history', error);
            deps.setTableMessage('#table-candidates-history tbody', 8, error.message);
        }
    }
    global.HanstockDashboardCandidateHistoryScreen = Object.freeze({ render: renderCandidateHistory });
}(window));
