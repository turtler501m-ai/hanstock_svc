(function (global) {
    'use strict';

    function hmToInput(value, fallback) {
        const clean = String(value || fallback).replace(':', '').padStart(4, '0');
        return `${clean.slice(0, 2)}:${clean.slice(2, 4)}`;
    }

    async function load(deps) {
        const { fetchJson, scheduleId } = deps;
        const response = await fetchJson(`/api/strategy/${scheduleId}/schedule`);
        const schedule = response.schedule || {};
        const fields = {
            'ai-schedule-enabled': Boolean(schedule.enabled),
            'ai-schedule-interval': Number(schedule.interval_minutes || 15),
            'ai-schedule-start': hmToInput(schedule.start_hm, '0900'),
            'ai-schedule-end': hmToInput(schedule.end_hm, '1530'),
            'ai-schedule-mode': schedule.mode || 'analysis_only',
            'ai-schedule-auto-approve': Boolean(schedule.auto_approve),
        };
        Object.entries(fields).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (!element) return;
            if (element.type === 'checkbox') element.checked = value;
            else element.value = value;
        });
        return schedule;
    }

    async function save(deps) {
        const { fetchJson, postJson, scheduleId, renderInfo } = deps;
        const payload = {
            enabled: Boolean(document.getElementById('ai-schedule-enabled')?.checked),
            interval_minutes: Number(document.getElementById('ai-schedule-interval')?.value || 15),
            start_hm: String(document.getElementById('ai-schedule-start')?.value || '09:00').replace(':', ''),
            end_hm: String(document.getElementById('ai-schedule-end')?.value || '15:30').replace(':', ''),
            weekdays: '1-5',
            mode: document.getElementById('ai-schedule-mode')?.value || 'analysis_only',
            auto_approve: Boolean(document.getElementById('ai-schedule-auto-approve')?.checked),
        };
        if (payload.enabled) {
            const strategies = await fetchJson('/api/ai-strategies');
            const applied = (strategies.strategies || []).filter((item) => item.selected && item.status === 'approved' && !item.independent_schedule);
            if (!applied.length) throw new Error('공용 AI 전략 중 승인된 전략을 적용해 주세요.');
        }
        await postJson(`/api/strategy/${scheduleId}/schedule`, payload);
        const status = document.getElementById('ai-schedule-save-status');
        if (status) status.textContent = '저장됨';
        await renderInfo();
    }

    global.HanstockDashboardAiScheduleSettings = { load, save };
})(window);
