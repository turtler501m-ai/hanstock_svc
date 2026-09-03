(function (global) {
    'use strict';

    function render(deps, data) {
        const { formatNumber, escapeHtml } = deps;
        const summary = data.summary || {};
        const policy = data.policy || {};
        const values = {
            'watchlist-total-count': summary.total_count || 0,
            'watchlist-eligible-count': summary.eligible_count || 0,
            'watchlist-ineligible-count': summary.ineligible_count || 0,
            'watchlist-unknown-count': summary.unknown_count || 0,
            'watchlist-sector-count': summary.sector_count || 0,
        };
        Object.entries(values).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = formatNumber(value);
        });
        const state = document.getElementById('watchlist-policy-state');
        if (state) {
            state.textContent = policy.enabled === false
                ? '\uc815\ucc45 \uc0ac\uc6a9 \uc548 \ud568'
                : `\ucd5c\uc18c ${formatNumber(policy.min_price || 0)}\uc6d0`;
            state.classList.toggle('is-disabled', policy.enabled === false);
        }
        const sectors = summary.sectors || [];
        const sectorSummary = document.getElementById('watchlist-sector-summary');
        if (sectorSummary) {
            const visibleSectors = sectors.slice(0, 8);
            const remainingSectorCount = Math.max(0, sectors.length - visibleSectors.length);
            sectorSummary.innerHTML = sectors.length
                ? visibleSectors.map((row) => `<span class="watchlist-sector-chip">${escapeHtml(row.sector)} <strong>${formatNumber(row.count)}\uac1c</strong> <span>${Number(row.ratio || 0).toFixed(1)}%</span></span>`).join('') + (remainingSectorCount ? `<span class="watchlist-sector-chip">\uc678 ${remainingSectorCount}\uac1c \uc139\ud130</span>` : '')
                : '<span class="watchlist-empty-copy">\ub4f1\ub85d\ub41c \uc885\ubaa9\uc758 \uc139\ud130 \uc815\ubcf4\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.</span>';
        }
        const sectorFilter = document.getElementById('select-watchlist-sector-filter');
        if (sectorFilter) {
            const selected = sectorFilter.value;
            sectorFilter.innerHTML = '<option value="all">\uc804\uccb4 \uc139\ud130</option>';
            sectors.forEach((row) => {
                const option = document.createElement('option');
                option.value = row.sector;
                option.textContent = `${row.sector} (${row.count})`;
                sectorFilter.appendChild(option);
            });
            sectorFilter.value = Array.from(sectorFilter.options).some((option) => option.value === selected) ? selected : 'all';
        }
        const enabledInput = document.getElementById('chk-watchlist-policy-enabled');
        const minPriceInput = document.getElementById('num-watchlist-min-price');
        const minMarketCapInput = document.getElementById('num-watchlist-min-market-cap');
        const fallbackInput = document.getElementById('chk-watchlist-mid-large-fallback');
        if (enabledInput) enabledInput.checked = policy.enabled !== false;
        if (minPriceInput) minPriceInput.value = Number(policy.min_price || 0);
        if (minMarketCapInput) minMarketCapInput.value = Number(policy.min_market_cap || 0) / 100000000;
        if (fallbackInput) fallbackInput.checked = policy.require_mid_large_when_market_cap_unknown !== false;
        return policy;
    }

    global.HanstockDashboardWatchlistSummaryScreen = { render };
})(window);
