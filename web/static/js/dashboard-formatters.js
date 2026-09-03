/* Shared presentation formatters for the dashboard. */
(function (global) {
    const formatters = {
        formatCurrency(value) {
            return new Intl.NumberFormat('ko-KR', {
                style: 'currency',
                currency: 'KRW',
                maximumFractionDigits: 0,
            }).format(Number(value || 0));
        },

        formatPercent(value) {
            const numeric = Number(value || 0);
            const sign = numeric > 0 ? '+' : '';
            return `${sign}${numeric.toFixed(2)}%`;
        },

        formatNumber(value, digits = 0) {
            return Number(value || 0).toLocaleString(undefined, {
                maximumFractionDigits: digits,
            });
        },

        escapeHtml(value) {
            return String(value ?? '')
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", '&#039;');
        },
    };

    global.HanstockDashboardFormatters = Object.freeze(formatters);
}(window));
