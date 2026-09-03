(function (global) {
    'use strict';

    async function handle(deps, event) {
        const { setButtonBusy, postJson, setStatus, renderConfig, renderBalance } = deps;
        event.preventDefault();
        const form = event.currentTarget;
        setButtonBusy('btn-strategy-save', true);
        try {
            const values = {};
            for (const input of Array.from(form.querySelectorAll('input[name]'))) {
                const raw = String(input.value || '').trim();
                if (!raw) throw new Error(`${input.name} 값이 비어 있습니다.`);
                let numeric = Number(raw);
                if (!Number.isFinite(numeric)) throw new Error(`${input.name} 값이 숫자가 아닙니다.`);
                if (input.dataset.type === 'int') numeric = Math.trunc(numeric);
                if (input.dataset.percent === 'true') numeric /= 100;
                values[input.name] = String(numeric);
            }
            const result = await postJson('/api/env', { values });
            setStatus(`전략 설정을 저장했습니다. 반영 항목: ${result.updated.join(', ')}`, true);
            try { await renderConfig(); } catch (error) { console.error('Failed to load config after save:', error); }
            await renderBalance();
        } catch (error) {
            setStatus(`전략 설정 저장 실패: ${error.message}`);
        } finally {
            setButtonBusy('btn-strategy-save', false);
        }
    }

    global.HanstockDashboardStrategySettingsSave = { handle };
})(window);
