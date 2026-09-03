(function (global) {
    'use strict';

    async function render(deps) {
        const { fetchJson, withActiveStrategy, setCycle, setText, formatNumber, strategyStatusLabel } = deps;
        try {
            const data = await fetchJson(withActiveStrategy('/api/strategy-context'));
            if (data.analysis_flow?.cycle) setCycle(data.analysis_flow.cycle);
            const active = data.active_strategy || {};
            const safety = data.safety || {};
            const applied = data.applied_strategies || [];
            setText('strategy-context-name', applied.length ? `적용 ${applied.length}개: ${applied.map((strategy) => strategy.name).join(', ')}` : (active.name || '-'));
            setText('strategy-context-detail', `현재 보기: ${active.name || '-'} · ${active.model || '-'} · AI ${formatNumber(Number(active.ai_weight || 0) * 100, 0)}%`);
            setText('strategy-context-status', strategyStatusLabel(active.status));
            setText('strategy-context-version', active.strategy_version ? `v${active.strategy_version}` : '-');
            setText('strategy-context-safety', `${safety.trading_env || '-'} / ${safety.dry_run ? 'DRY_RUN' : 'LIVE'}`);
            setText('strategy-context-approval', '모의계좌 거래로 결과를 확인');
        } catch (error) {
            console.error('Failed to render strategy context:', error);
        }
    }

    global.HanstockDashboardStrategyContext = { render };
})(window);
