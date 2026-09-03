(function (global) {
    'use strict';

    function render(deps, labels, data, colors) {
        const { getChart, setChart, escapeHtml, formatNumber } = deps;
        if (typeof Chart === 'undefined') return;
        const canvas = document.getElementById('portfolioChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const total = data.reduce((sum, value) => sum + Number(value || 0), 0);
        const legend = document.getElementById('portfolio-legend');
        if (legend) {
            legend.innerHTML = labels.map((label, index) => {
                const ratio = total > 0 ? Number(data[index] || 0) / total * 100 : 0;
                return `<div class="asset-allocation-legend-item" title="${escapeHtml(label)}">
                <span class="asset-allocation-legend-swatch" style="background:${escapeHtml(colors[index] || '#64748b')}"></span>
                <span class="asset-allocation-legend-name">${escapeHtml(label)}</span>
                <span class="asset-allocation-legend-value">${formatNumber(ratio, 1)}%</span>
            </div>`;
            }).join('');
        }
        const previous = getChart();
        if (previous) previous.destroy();
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.font.family = "'Noto Sans KR', 'Inter', sans-serif";
        setChart(new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '65%' },
        }));
    }

    global.HanstockDashboardPortfolioChart = { render };
})(window);
