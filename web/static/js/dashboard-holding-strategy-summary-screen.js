/* Holding strategy summary rendering. Loaded before app.js. */
(function (global) {
    function renderSummary(balance, selectedFilter, deps) {
        const summaryRows = balance.strategy_summary || [];
        const holdingSummary = balance.holding_summary || {};
        const tbody = document.querySelector('#table-holding-strategies tbody');
        const filter = document.getElementById('select-holding-strategy-filter');
        const attributedCount = summaryRows.filter((item) => item.strategy_id !== 'unattributed').length;
        const hasUnattributed = summaryRows.some((item) => item.strategy_id === 'unattributed');
        deps.setText('holding-strategy-count', `${deps.formatNumber(attributedCount)}${deps.labels.items}${deps.labels.strategy}${hasUnattributed ? ` ${deps.labels.separator} ${deps.labels.unattributed}` : ''}`);
        deps.setText('holding-profit-count', deps.formatNumber(holdingSummary.profit_count || 0));
        deps.setText('holding-loss-count', deps.formatNumber(holdingSummary.loss_count || 0));
        deps.setText('holding-flat-count', deps.formatNumber(holdingSummary.flat_count || 0));
        deps.setText('holding-attribution-coverage', `${deps.formatNumber(holdingSummary.attribution_coverage || 0, 1)}%`);
        if (tbody) {
            tbody.innerHTML = '';
            if (!summaryRows.length) {
                deps.setTableMessage('#table-holding-strategies tbody', 8, deps.labels.empty);
            } else {
                summaryRows.forEach((item) => {
                    const pnl = Number(item.pnl || 0);
                    const status = pnl < 0 ? 'loss' : (pnl > 0 ? 'profit' : 'flat');
                    const row = document.createElement('tr');
                    row.innerHTML = `<td><div class="symbol-name">${deps.escapeHtml(item.strategy_name || item.strategy_id)}</div><div class="symbol-code">${deps.escapeHtml(item.strategy_id)}</div></td><td><strong>${deps.formatNumber(item.holding_count || 0)}${deps.labels.items}</strong><small class="time-muted">${deps.labels.loss} ${deps.formatNumber(item.loss_holding_count || 0)}${deps.labels.items}</small></td><td>${deps.formatCurrency(item.evaluation_amount)}</td><td>${deps.formatNumber(item.allocation_ratio || 0, 1)}%</td><td class="${pnl >= 0 ? 'text-success' : 'text-danger'}">${deps.formatCurrency(pnl)}</td><td class="${pnl >= 0 ? 'text-success' : 'text-danger'}">${deps.formatPercent(item.return_rate)}</td><td><span class="holding-pnl-badge is-${status}">${status === 'loss' ? deps.labels.loss : (status === 'profit' ? deps.labels.profit : deps.labels.flat)}</span></td><td><button type="button" class="button-danger compact-button strategy-sell-all" data-strategy-id="${deps.escapeHtml(item.strategy_id)}" data-strategy-name="${deps.escapeHtml(item.strategy_name || item.strategy_id)}">${deps.labels.sellAll}</button></td>`;
                    tbody.appendChild(row);
                });
                tbody.querySelectorAll('.strategy-sell-all').forEach((button) => button.addEventListener('click', () => deps.sellAll(button), { once: true }));
            }
        }
        let nextFilter = selectedFilter;
        if (filter) {
            const available = new Set(summaryRows.map((item) => String(item.strategy_id || '')));
            if (nextFilter !== 'all' && !available.has(nextFilter)) nextFilter = 'all';
            filter.innerHTML = [`<option value="all">${deps.labels.all}</option>`, ...summaryRows.map((item) => `<option value="${deps.escapeHtml(item.strategy_id)}">${deps.escapeHtml(item.strategy_name || item.strategy_id)}</option>`)].join('');
            filter.value = nextFilter;
        }
        const lossList = document.getElementById('holding-loss-list');
        if (lossList) {
            const losses = (balance.holdings || []).filter((holding) => deps.pnlStatus(holding) === 'loss').sort((a, b) => Number(a.pnl || 0) - Number(b.pnl || 0));
            lossList.innerHTML = losses.length ? `<div class="holding-loss-list-title">${deps.labels.lossTitle}</div>${losses.slice(0, 5).map((holding) => `<div class="holding-loss-item"><span><strong>${deps.escapeHtml(holding.name || holding.symbol)}</strong><small>${deps.escapeHtml(holding.symbol)}</small></span><span class="text-danger"><strong>${deps.formatCurrency(holding.pnl)}</strong><small>${deps.formatPercent(holding.rt)}</small></span></div>`).join('')}` : `<div class="holding-loss-empty">${deps.labels.noLoss}</div>`;
        }
        return nextFilter;
    }
    global.HanstockDashboardHoldingStrategySummaryScreen = Object.freeze({ render: renderSummary });
}(window));
