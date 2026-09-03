/* Trade cleanup screen rendering. Loaded before app.js. */
(function (global) {
    async function renderTradeCleanup(deps) {
        const tbody = document.querySelector('#table-trade-cleanup tbody');
        if (!tbody) return;
        try {
            const result = await deps.fetchJson('/api/trades/local-cleanup?limit=200', 15000);
            const trades = Array.isArray(result.trades) ? result.trades : [];
            tbody.innerHTML = '';
            if (!trades.length) {
                tbody.innerHTML = `<tr><td colspan="7">${deps.labels.empty}</td></tr>`;
                return;
            }
            trades.forEach((trade) => {
                const [datePart = '-', timePart = '-'] = String(trade.ts || '').split(' ');
                const action = String(trade.action || '').toLowerCase();
                const actionLabel = action === 'buy' ? deps.labels.buy : action === 'sell' ? deps.labels.sell : action || '-';
                const riskLabel = trade.cleanup_risk === 'low' ? deps.labels.lowRisk : deps.labels.highRisk;
                const reason = trade.response_msg || trade.cleanup_reason || '-';
                const row = document.createElement('tr');
                row.innerHTML = `<td><div>${deps.escapeHtml(datePart)}</div><div class="time-muted">${deps.escapeHtml(timePart.substring(0, 5))}</div></td><td><span class="symbol-name">${deps.escapeHtml(trade.name || trade.symbol || '-')}</span><div class="time-muted">${deps.escapeHtml(trade.symbol || '-')}</div></td><td>${deps.escapeHtml(actionLabel)}</td><td>${Number(trade.qty || 0).toLocaleString()}</td><td><span class="badge">${deps.escapeHtml(deps.orderStatusLabel(trade.order_status))}</span><div class="time-muted">${deps.labels.risk} ${deps.escapeHtml(riskLabel)}</div></td><td><div class="reason-cell" title="${deps.escapeHtml(reason)}">${deps.escapeHtml(reason)}</div></td><td><button type="button" class="button-ghost delete-cleanup-trade" data-id="${Number(trade.id)}">${deps.labels.delete}</button></td>`;
                tbody.appendChild(row);
            });
            tbody.querySelectorAll('.delete-cleanup-trade').forEach((button) => {
                button.addEventListener('click', async () => {
                    const tradeId = Number(button.dataset.id || 0);
                    if (!tradeId || !confirm(deps.labels.confirm)) return;
                    try {
                        await deps.deleteJson(`/api/trades/local/${tradeId}?confirm=true`);
                        await deps.reload();
                    } catch (error) {
                        window.alert(error.message || deps.labels.deleteFailed);
                    }
                });
            });
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="7">${deps.escapeHtml(error.message || deps.labels.loadFailed)}</td></tr>`;
        }
    }
    global.HanstockDashboardTradeCleanupScreen = Object.freeze({ render: renderTradeCleanup });
}(window));
