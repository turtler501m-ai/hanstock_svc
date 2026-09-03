/* Account risk summary rendering. Loaded before app.js. */
(function (global) {
    function renderRisk(balance, deps) {
        const holdings = balance.holdings || [];
        const holdingValue = holdings.reduce((sum, holding) => sum + Number(holding.value || (Number(holding.qty || 0) * Number(holding.price || 0))), 0);
        const reportedTotal = Number(balance.total_eval || 0);
        const cash = Number(balance.cash || 0);
        const exposure = Number(balance.stock_eval || holdingValue || 0);
        const total = exposure > 0 && reportedTotal < Math.max(cash, exposure) ? cash + exposure : reportedTotal;
        const cashRatio = typeof balance.cash_ratio === 'number' ? balance.cash_ratio : (total > 0 ? Math.min(1, Math.max(0, cash / total)) : 0);
        const maxPosition = Math.max(0, ...holdings.map((holding) => Number(holding.value || 0)));
        const concentration = total > 0 ? Math.min(1, Math.max(0, maxPosition / total)) : 0;
        const pnl = Number(balance.pnl || 0);
        const capital = Number(deps.config?.total_capital || total || 1);
        const lossUsage = pnl < 0 && deps.config?.max_daily_loss_pct ? Math.min(999, Math.abs(pnl) / capital * 100 / deps.config.max_daily_loss_pct * 100) : 0;
        deps.setText('val-stock-eval', deps.formatCurrency(exposure));
        deps.setText('risk-cash-ratio', `${deps.formatNumber(cashRatio * 100, 1)}%`);
        deps.setText('risk-concentration', `${deps.formatNumber(concentration * 100, 1)}%`);
        deps.setText('risk-loss-usage', lossUsage > 0 ? `${deps.formatNumber(lossUsage, 1)}% ${deps.labels.used}` : deps.labels.normal);
    }
    global.HanstockDashboardRiskScreen = Object.freeze({ render: renderRisk });
}(window));
