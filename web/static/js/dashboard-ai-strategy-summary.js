(function (global) {
    'use strict';

    function render(deps, config) {
        const { setText, formatNumber, escapeHtml } = deps;
        const ai = config.ai_analysis || {};
        const enabled = Boolean(ai.enabled);
        const available = Boolean(ai.model_available);
        const modelStatus = enabled ? (available ? '모델 사용 준비' : '규칙 기반 대체') : 'AI 꺼짐';
        const modelDetail = enabled && available
            ? `${ai.provider_label || 'OpenAI API'} / ${ai.model_type || '텍스트 모델'}`
            : (enabled ? 'OPENAI_API_KEY 없음: Seven Split 규칙 점수로 분석' : 'Seven Split 규칙 점수만 사용');
        const ruleWeight = Number(ai.rule_weight ?? 1) * 100;
        const scoreWeight = Number(ai.score_weight ?? 0) * 100;
        const accountText = ai.account || config.namuh_account || '-';
        const flow = ai.auto_approve ? 'AI 제안 후 자동승인 설정 켜짐' : 'AI 제안 후 승인 대기';
        setText('ai-summary-model', `${modelStatus} · ${ai.model_name || '-'}`);
        setText('ai-summary-model-detail', modelDetail);
        setText('ai-summary-account', accountText);
        setText('ai-summary-weight', `규칙 ${formatNumber(ruleWeight, 0)}% / AI ${formatNumber(scoreWeight, 0)}%`);
        setText('ai-summary-flow', flow);
        const flowEl = document.getElementById('ai-flow-list');
        if (flowEl) {
            const items = (ai.flow || []).map((item) => `<span>${escapeHtml(item)}</span>`).join('');
            flowEl.innerHTML = items || '<span>현재 계좌는 Seven Split 전략 기준으로 후보를 분석합니다.</span>';
        }
    }

    global.HanstockDashboardAiStrategySummary = { render };
})(window);
