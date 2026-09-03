(function (global) {
    'use strict';

    function render(data, aiSchedule) {
        const dispatch = data.strategy_dispatch || {};
        const config = data.config || {};
        const set = (id, value, className) => {
            const element = document.getElementById(id);
            if (!element) return;
            element.textContent = value;
            if (className !== undefined) element.className = className;
        };
        set('sched-overview-schedule-state', aiSchedule.enabled ? `사용 · ${Number(aiSchedule.interval_minutes || 15)}분 간격` : '사용 안 함', aiSchedule.enabled ? 'is-active' : '');
        set('sched-overview-strategy-count', `사용 ${dispatch.enabled_count || 0} / 전체 ${dispatch.schedule_count || 0}`);
        const real = config.trading_env === 'real';
        set('sched-overview-env', real ? '실전투자' : '모의투자', real ? 'is-warning' : 'is-active');
        set('sched-cron-tz', config.cron_tz || '-');
        set('sched-daily-retries', `${config.daily_auto_retries ?? '-'}회`);
        set('sched-daily-retry-delay', `${config.daily_auto_retry_delay_seconds ?? '-'}초`);
        set('sched-retries', `${config.scheduler_retries ?? '-'}회`);
        set('sched-retry-delay', `${config.scheduler_retry_delay_seconds ?? '-'}초`);
        set('sched-slack-enabled', config.slack_enabled === 'true' ? '활성화' : '비활성화');
        set('sched-sync-enabled', config.sync_enabled === 'true' ? '활성화' : '비활성화');
        set('sched-trading-env', real ? '실전투자' : '모의투자');
        const dispatchText = dispatch.summary || `사용 ${dispatch.enabled_count || 0}개 / 전체 ${dispatch.schedule_count || 0}개 / 감시종목 ${dispatch.universe_count || 0}개`;
        set('sched-active-strategy', `${data.active_strategy_name || '-'} (${data.active_strategy_id || '-'}) · ${dispatchText}`);
        const runState = data.run_state || {};
        const modeLabel = runState.mode === 'daily_auto' ? 'AI 자동매매' : (runState.mode === 'execute' ? '주문 실행' : '분석 전용');
        set('sched-overview-run-state', runState.is_running ? `실행 중 · ${modeLabel}` : '대기', runState.is_running ? 'is-warning' : 'is-active');
        return runState;
    }

    global.HanstockDashboardSchedulerOverview = { render };
})(window);
