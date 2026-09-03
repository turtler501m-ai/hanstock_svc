/* Holdings table rendering. Loaded before app.js. */
(function (global) {
    function renderHoldings(rows, config, deps) {
        const tbody = document.querySelector('#table-holdings tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!rows.length) {
            deps.setTableMessage('#table-holdings tbody', 10, deps.labels.empty);
            deps.updateHeaders();
            return;
        }
        rows.forEach((holding) => {
            const rtClass = Number(holding.rt || 0) >= 0 ? 'text-success' : 'text-danger';
            const pnlStatus = deps.pnlStatus(holding);
            const pnlLabel = pnlStatus === 'loss' ? deps.labels.loss : (pnlStatus === 'profit' ? deps.labels.profit : deps.labels.flat);
            const allocations = holding.strategy_allocations || [];
            const qty = Number(holding.qty || 0);
            const sellableQty = Number(holding.sellable_qty ?? holding.qty ?? 0);
            const sellPending = Boolean(holding.sell_pending);
            const weight = Number(holding.hanstock_weight || 0);
            const maxWeight = Number(config?.max_single_weight || 0);
            const exceeded = maxWeight > 0 && weight > maxWeight + 0.000001;
            const canSell = sellableQty > 0 && !sellPending;
            let qtyText = sellableQty !== qty ? `${qty.toLocaleString()} <small class="time-muted">${deps.labels.sellable} ${sellableQty.toLocaleString()}</small>` : qty.toLocaleString();
            if (sellPending) qtyText += ` <small class="time-muted">${deps.labels.pending}</small>`;
            const allocationHtml = allocations.length ? allocations.map((item) => `<span class="holding-strategy-chip">${deps.escapeHtml(item.strategy_name || item.strategy_id)}<small>${deps.formatNumber(item.allocated_qty || 0)}${deps.labels.items}</small><button type="button" class="button-ghost strategy-attribution-sell" data-symbol="${deps.escapeHtml(holding.symbol)}" data-name="${deps.escapeHtml(holding.name)}" data-strategy-id="${deps.escapeHtml(item.strategy_id)}" data-strategy-name="${deps.escapeHtml(item.strategy_name || item.strategy_id)}" data-qty="${Number(item.allocated_qty || 0)}" ${(Number(item.allocated_qty || 0) > 0 && sellableQty > 0 && !sellPending) ? '' : 'disabled'}>${deps.labels.sell}</button></span>`).join('') : `<span class="time-muted">${deps.labels.unattributed}</span>`;
            const row = document.createElement('tr');
            row.innerHTML = `<td><div class="symbol-name">${deps.escapeHtml(holding.name)}</div><div class="symbol-code">${deps.escapeHtml(holding.symbol)}</div></td><td>${qtyText}</td><td>${deps.formatCurrency(holding.price)}</td><td>${deps.formatCurrency(holding.value || qty * Number(holding.price || 0))}</td><td class="${exceeded ? 'text-danger' : ''}"><strong>${deps.formatNumber(weight * 100, 2)}%</strong>${exceeded ? `<small class="time-muted">${deps.labels.exceeded}</small>` : ''}</td><td class="${rtClass}">${deps.formatPercent(holding.rt)}</td><td class="${rtClass}">${deps.formatCurrency(holding.pnl)}</td><td><span class="holding-pnl-badge is-${pnlStatus}">${pnlLabel}</span></td><td><div class="holding-strategy-chips">${allocationHtml}</div></td><td><button type="button" class="button-ghost queue-order" data-symbol="${deps.escapeHtml(holding.symbol)}" data-name="${deps.escapeHtml(holding.name)}" data-action="sell" data-qty="${sellableQty}" data-price="0" data-reason="dashboard sell current holding" data-source="dashboard_holding_sell" ${canSell ? '' : 'disabled'}>${sellPending ? deps.labels.pending : deps.labels.sellAll}</button></td>`;
            tbody.appendChild(row);
        });
        tbody.querySelectorAll('.queue-order').forEach((button) => button.addEventListener('click', () => deps.createApproval(button), { once: true }));
        tbody.querySelectorAll('.strategy-attribution-sell').forEach((button) => button.addEventListener('click', () => deps.sellAttribution(button), { once: true }));
        deps.updateHeaders();
    }
    global.HanstockDashboardHoldingsScreen = Object.freeze({ render: renderHoldings });
}(window));
