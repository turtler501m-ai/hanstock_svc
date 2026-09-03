/* Holding account summary card rendering. Loaded before app.js. */
(function (global) {
    function renderHoldingAccountSummary(balance, displayTotal, realizedPnl, deps) {
        const summary = document.getElementById('holding-account-summary');
        if (!summary) return;
        const stockEval = Number(balance.stock_eval || 0);
        const cash = Number(balance.cash || 0);
        const orderableCash = Number(balance.orderable_cash ?? cash);
        const pnl = Number(balance.pnl || 0);
        const cashRatio = typeof balance.cash_ratio === 'number' ? balance.cash_ratio : (displayTotal > 0 ? cash / displayTotal : 0);
        const stockRatio = typeof balance.stock_ratio === 'number' ? balance.stock_ratio : (displayTotal > 0 ? stockEval / displayTotal : 0);
        const count = (balance.holdings || []).length;
        const source = balance._cache?.stale ? `${deps.labels.stale} ${balance._cache.cached_at || ''}`.trim() : deps.labels.current;
        summary.innerHTML = `<div><span>${deps.escapeHtml(source)}</span><strong>${deps.formatCurrency(displayTotal)}</strong><small>${deps.labels.total}</small></div><div><span>${deps.labels.stock}</span><strong>${deps.formatCurrency(stockEval)}</strong><small>${deps.labels.ratio} ${deps.formatNumber(stockRatio * 100, 1)}%</small></div><div><span>${deps.labels.cash}</span><strong>${deps.formatCurrency(cash)}</strong><small>${deps.labels.ratio} ${deps.formatNumber(cashRatio * 100, 1)}% · ${deps.labels.orderable} ${deps.formatCurrency(orderableCash)}</small></div><div><span>${deps.labels.pnl}</span><strong class="${pnl >= 0 ? 'text-success' : 'text-danger'}">${deps.formatCurrency(pnl)}</strong><small>${deps.labels.realized} ${deps.formatCurrency(realizedPnl)}</small></div><div><span>${deps.labels.holdings}</span><strong>${deps.formatNumber(count)}${deps.labels.items}</strong><small>${deps.labels.sortHint}</small></div>`;
    }
    global.HanstockDashboardHoldingSummaryScreen = Object.freeze({ render: renderHoldingAccountSummary });
}(window));
