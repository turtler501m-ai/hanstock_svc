(function (global) {
    'use strict';

    function render(deps, payload) {
        const { escapeHtml, formatNumber, formatCurrency, aiActionGuide, aiDecisionLabel, strategyReasonLabel } = deps;
        const reasons = Array.isArray(payload.reasons) ? payload.reasons : [];
        const summary = payload.reasoning_kr || aiActionGuide(payload.action, payload.name);
        const reasonItems = reasons.length
            ? reasons.map((reason) => `<li>${escapeHtml(strategyReasonLabel(reason))}</li>`).join('')
            : '<li>전략 기준의 신호가 충분하지 않아 보수적으로 판단했습니다.</li>';
        const signalItems = [
            `AI 점수는 <strong>${escapeHtml(formatNumber(payload.score, 2))}</strong>입니다.`,
            `현재 비중은 <strong>${escapeHtml(formatNumber(payload.currentWeight * 100, 1))}%</strong>, 목표 비중은 <strong>${escapeHtml(formatNumber(payload.targetWeight * 100, 1))}%</strong>입니다.`,
            `차이 금액은 <strong>${escapeHtml(formatCurrency(payload.deltaValue))}</strong>이며 실행은 <strong>${escapeHtml(aiDecisionLabel(payload.action))}</strong>입니다.`,
            `최근 변동성은 <strong>${escapeHtml(formatNumber(payload.volatility * 100, 1))}%</strong>로 계산했습니다.`,
        ].map((line) => `<li>${line}</li>`).join('');
        return `<div class="ai-modal-summary"><div class="ai-modal-badge ${escapeHtml(payload.action)}">${escapeHtml(aiDecisionLabel(payload.action))}</div><p>${escapeHtml(summary)}</p></div>
        <div class="ai-modal-section"><h3>신호별 보기</h3><ul class="ai-modal-list">${signalItems}</ul></div>
        <div class="ai-modal-section"><h3>전략 판단 근거</h3><ul class="ai-modal-list">${reasonItems}</ul>${reasons.length ? `<div class="ai-modal-raw">${escapeHtml(reasons.join(' | '))}</div>` : ''}</div>
        <div class="ai-modal-section"><h3>해석 방법</h3><p class="ai-modal-footnote">목표 비중과 현재 비중의 차이를 기준으로 매수·축소 방향을 해석합니다.</p></div>`;
    }

    global.HanstockDashboardAiDetailModal = { render };
})(window);
