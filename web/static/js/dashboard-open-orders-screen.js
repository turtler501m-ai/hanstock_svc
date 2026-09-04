/* Open-order table rendering. Loaded before app.js. */
(function (global) {
    async function renderOpenOrders(deps) {
        const tbody = document.querySelector('#table-open-orders tbody');
        if (!tbody) return;
        try {
            const statusQuery = encodeURIComponent(deps.activeStatuses.join(','));
            const data = await deps.fetchJson(`/api/orders?status=${statusQuery}&limit=100`);
            const rows = Array.isArray(data.items) ? data.items : [];
            const summary = document.getElementById('open-order-summary');
            const buyCount = rows.filter((row) => row.side === 'buy').length;
            const sellCount = rows.filter((row) => row.side === 'sell').length;
            if (summary) summary.textContent = `${rows.length} ${deps.labels.orders} · ${buyCount} ${deps.labels.buy} · ${sellCount} ${deps.labels.sell}`;
            if (!rows.length) {
                deps.setTableMessage('#table-open-orders tbody', 10, deps.labels.empty);
                return;
            }
            tbody.innerHTML = rows.map((row) => {
                const requestedQty = Number(row.requested_qty || 0);
                const filledQty = Number(row.filled_qty || 0);
                const remainingQty = Math.max(0, requestedQty - filledQty);
                const status = String(row.status || '');
                const cancellable = ['submitted', 'open', 'partial'].includes(status)
                    && Boolean(row.broker_order_id) && remainingQty > 0;
                const resolvableUnknown = status === 'broker_unknown'
                    && !row.broker_order_id && remainingQty > 0;
                const side = row.side === 'buy' ? deps.labels.buy : deps.labels.sell;
                const sideKind = row.side === 'buy' ? 'buy' : 'sell';
                const action = cancellable
                    ? `<div class="button-row"><button type="button" class="button-danger compact-button cancel-open-order" data-id="${deps.escapeHtml(row.id)}" data-symbol="${deps.escapeHtml(row.symbol || '')}" data-name="${deps.escapeHtml(row.name || row.symbol || '')}" data-side="${deps.escapeHtml(row.side || '')}">${deps.labels.cancel}</button><button type="button" class="button-primary compact-button market-replace-open-order" data-id="${deps.escapeHtml(row.id)}" data-symbol="${deps.escapeHtml(row.symbol || '')}" data-name="${deps.escapeHtml(row.name || row.symbol || '')}" data-side="${deps.escapeHtml(row.side || '')}">${deps.labels.marketReplace}</button></div>`
                    : resolvableUnknown
                        ? `<button type="button" class="button-danger compact-button resolve-unknown-order" data-id="${deps.escapeHtml(row.id)}" data-symbol="${deps.escapeHtml(row.symbol || '')}" data-name="${deps.escapeHtml(row.name || row.symbol || '')}">${deps.labels.resolve}</button>`
                        : `<span class="time-muted">${deps.labels.noAction}</span>`;
                return `<tr><td>#${deps.escapeHtml(row.id || '-')}</td><td>${deps.escapeHtml(deps.strategyDisplayName(row.strategy_id || 'unattributed'))}</td><td>${deps.pill(side, sideKind)}</td><td><div class="symbol-name">${deps.escapeHtml(row.name || row.symbol || '-')}</div><div class="symbol-code">${deps.escapeHtml(row.symbol || '-')}</div></td><td><div>${requestedQty.toLocaleString()} / ${filledQty.toLocaleString()} / ${remainingQty.toLocaleString()}</div><small class="time-muted">${deps.labels.requested} / ${deps.labels.filled} / ${deps.labels.remaining}</small></td><td>${Number(row.order_price || 0) > 0 ? deps.formatCurrency(row.order_price) : deps.labels.marketPrice}</td><td>${deps.pill(deps.orderStatusLabel(status), status === 'partial' ? 'warn' : 'hold')}</td><td>${deps.escapeHtml(row.broker_order_id || '-')}</td><td>${deps.escapeHtml(deps.formatCheckedAt(row.last_synced_at))}</td><td>${action}</td></tr>`;
            }).join('');
            tbody.querySelectorAll('.cancel-open-order').forEach((button) => {
                button.addEventListener('click', () => deps.cancelOpenOrder(button));
            });
            tbody.querySelectorAll('.market-replace-open-order').forEach((button) => {
                button.addEventListener('click', () => deps.cancelReplaceMarketOrder(button));
            });
            tbody.querySelectorAll('.resolve-unknown-order').forEach((button) => {
                button.addEventListener('click', () => deps.resolveUnknownOpenOrder(button));
            });
        } catch (error) {
            deps.setTableMessage('#table-open-orders tbody', 10, error.message);
        }
    }
    global.HanstockDashboardOpenOrdersScreen = Object.freeze({ render: renderOpenOrders });
}(window));
