(function (global) {
    'use strict';

    async function renderCached(deps, strategyIds, strategies = [], options = {}) {
        const { fetchJson, renderCards } = deps;
        const updating = options.updating !== false;
        const finalError = options.error || null;
        const optimizer = document.getElementById('select-portfolio-optimizer')?.value || 'score_tilted_inverse_vol';
        const results = await Promise.all(strategyIds.map(async (strategyId) => {
            try {
                const params = new URLSearchParams({
                    strategy_id: strategyId,
                    min_score: '2',
                    optimizer,
                    refresh: 'false',
                    cache_only: 'true',
                });
                const data = await fetchJson(`/api/candidates?${params.toString()}`, 30000);
                return { strategyId, data, updating, error: finalError };
            } catch (error) {
                return {
                    strategyId,
                    data: { candidates: [], scanned: 0, _cache: { missing: true } },
                    error: error.message,
                    updating,
                };
            }
        }));
        renderCards(results, strategies);
    }

    function finishUpdating() {
        document.querySelectorAll('.strategy-preview-card .strategy-preview-metrics .is-complete')
            .forEach((status) => { status.textContent = '\uc5c5\ub370\uc774\ud2b8 \uc644\ub8cc'; });
    }

    global.HanstockDashboardStrategyPreviewCache = { renderCached, finishUpdating };
})(window);
