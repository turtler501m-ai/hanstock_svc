(function (global) {
    'use strict';

    function disableButtons(disabled) {
        ['btn-run-daily-auto', 'btn-run-analysis-only', 'btn-run-execute'].forEach((id) => {
            const button = document.getElementById(id);
            if (button) button.disabled = disabled;
        });
    }

    async function trigger(deps, mode) {
        const { setButtonBusy, postJson, getStrategyIds, getActiveStrategyId, setStatus, startPolling } = deps;
        const btnId = mode === 'daily_auto' ? 'btn-run-daily-auto' : (mode === 'analysis_only' ? 'btn-run-analysis-only' : 'btn-run-execute');
        const button = document.getElementById(btnId);
        if (!button) return;
        setButtonBusy(button, true);
        disableButtons(true);
        const panel = document.getElementById('scheduler-running-panel');
        if (panel) panel.hidden = false;
        const log = document.getElementById('scheduler-running-log');
        if (log) log.textContent = `[${new Date().toLocaleTimeString()}] ${mode} 스케줄 실행을 시작합니다.\n`;
        try {
            const strategyIds = getStrategyIds();
            const strategyId = getActiveStrategyId();
            const result = await postJson('/api/scheduler/run', { mode, strategy_id: strategyIds.length ? null : (strategyId || null), strategy_ids: strategyIds, allowed_categories: ['position', 'candidate', 'ai_rebalance'] });
            if (result.status !== 'started') throw new Error(result.detail || '실행 요청이 거절되었습니다.');
            if (log) log.textContent += `[${new Date().toLocaleTimeString()}] 백그라운드 실행이 등록되었습니다.\n`;
            startPolling(mode);
        } catch (error) {
            if (log) log.textContent += `[오류] 실행 실패: ${error.message}\n`;
            setStatus(`스케줄 즉시 실행 실패: ${error.message}`);
            disableButtons(false);
        } finally {
            setButtonBusy(button, false);
        }
    }

    function createPolling(deps, mode, getInterval, setIntervalId) {
        const { fetchJson, getActiveStrategyId, setStatus, refreshAll } = deps;
        if (getInterval()) return;
        disableButtons(true);
        const panel = document.getElementById('scheduler-running-panel');
        if (panel) panel.hidden = false;
        const log = document.getElementById('scheduler-running-log');
        let attempts = 0;
        const intervalId = setInterval(async () => {
            attempts += 1;
            try {
                const strategyId = getActiveStrategyId();
                const query = strategyId ? `?strategy_id=${encodeURIComponent(strategyId)}` : '';
                const data = await fetchJson(`/api/scheduler/status${query}`);
                const state = data.run_state || {};
                if (!state.is_running) {
                    clearInterval(intervalId);
                    setIntervalId(null);
                    if (log) log.textContent += `[${new Date().toLocaleTimeString()}] 스케줄 실행이 완료되었습니다.\n`;
                    setStatus(state.error ? `스케줄 실행 오류: ${state.error}` : '스케줄 실행이 정상 완료되었습니다.', !state.error);
                    await refreshAll();
                } else if (log && (attempts === 1 || attempts % 3 === 0)) {
                    log.textContent = `[${new Date().toLocaleTimeString()}] ${state.mode || mode} 모드 실행 중...\n(시작 시각: ${state.started_at || '-'})\n`;
                }
            } catch (error) {
                console.error('Failed to fetch scheduler status', error);
            }
        }, 3000);
        setIntervalId(intervalId);
    }

    global.HanstockDashboardSchedulerActions = { disableButtons, trigger, createPolling };
})(window);
