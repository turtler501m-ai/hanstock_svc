(function (global) {
    'use strict';

    function render(deps, schedules = []) {
        const { getActiveStrategyId, strategyDisplayName, formatKstTime, toKorAction, escapeHtml } = deps;
        const container = document.getElementById('scheduler-strategy-checklist');
        if (!container) return;
        const scheduled = new Set(schedules.filter((row) => row.enabled).map((row) => String(row.strategy_id)));
        const activeId = getActiveStrategyId();
        const strategies = schedules.filter((row) => row.strategy_id).map((row) => ({
            id: String(row.strategy_id), name: row.display_name || row.strategy_name || String(row.strategy_id),
            selected: Boolean(row.enabled), lastStatus: row.last_status || 'never_run',
            lastResultAt: row.last_result_at || row.last_run_at || null,
            lastErrors: Array.isArray(row.last_errors) ? row.last_errors : [],
        }));
        container.innerHTML = strategies.map((strategy) => {
            const checked = scheduled.has(strategy.id) || strategy.id === activeId || (!activeId && strategy.selected);
            const statusLabel = ['success', 'completed'].includes(strategy.lastStatus) ? '최근 성공'
                : strategy.lastStatus === 'failed' ? '최근 실패' : strategy.lastStatus === 'blocked' ? '실행 차단'
                : strategy.lastStatus === 'partial' ? '부분 실패' : '실행 기록 없음';
            const errorText = strategy.lastErrors.map((item) => {
                const target = [item.symbol, item.action ? toKorAction(item.action) : ''].filter(Boolean).join(' ');
                return `${target ? `${target}: ` : ''}${item.message || '내용 없는 오류'}`;
            }).join('\n');
            const statusClass = ['failed', 'partial', 'blocked'].includes(strategy.lastStatus) ? 'is-error' : 'time-muted';
            return `<label class="scheduler-strategy-option"><input type="checkbox" class="scheduler-strategy-checkbox" value="${escapeHtml(strategy.id)}" ${checked ? 'checked' : ''}><span>${escapeHtml(strategyDisplayName(strategy))}<small class="${statusClass}" style="display:block;margin-top:3px;white-space:pre-wrap;">${escapeHtml(statusLabel)} · ${escapeHtml(formatKstTime(strategy.lastResultAt))}${errorText ? `\n${escapeHtml(errorText)}` : ''}</small></span></label>`;
        }).join('') || '<span class="time-muted">실행 가능한 전략이 없습니다.</span>';
    }

    function selectedIds() {
        return Array.from(document.querySelectorAll('.scheduler-strategy-checkbox:checked'))
            .map((input) => String(input.value || '').trim()).filter(Boolean);
    }

    global.HanstockDashboardSchedulerStrategyChecklist = { render, selectedIds };
})(window);
