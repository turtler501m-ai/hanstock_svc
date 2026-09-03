(function (global) {
    'use strict';

    function render(deps, row) {
        const { escapeHtml, formatNumber, pill, aiModelStatusLabel, aiModelStatusKind } = deps;
        const ruleScore = Number(row.rule_score ?? row.score ?? 0);
        const finalScore = Number(row.final_score ?? row.score ?? ruleScore);
        const mlScore = row.ml_score == null ? null : Number(row.ml_score);
        const modelStatus = row.ai_model_status || (row.ai_enabled ? 'fallback' : 'disabled');
        const weight = Number(row.ai_score_weight || 0);
        const features = (row.top_features || []).slice(0, 3)
            .map((item) => `<span>${escapeHtml(item.name)} ${formatNumber(item.value, 3)}</span>`).join('');
        const fallback = row.ai_fallback_reason ? `<div class="candidate-ai-note">${escapeHtml(row.ai_fallback_reason)}</div>` : '';
        const risk = row.strategy_risk || row.indicators?.strategy_risk || {};
        const conditions = [['추세', risk.trend_ok], ['회복', risk.recovery_confirmed ?? risk.rsi_recovered ?? risk.ha_confirmed], ['돌파', risk.price_confirmed ?? risk.breakout_confirmed], ['이벤트', risk.event_risk === false], ['재진입', risk.reentry_reset_ok]]
            .filter(([, value]) => value !== undefined)
            .map(([label, passed]) => `<span>${escapeHtml(label)} ${passed ? '통과' : '대기'}</span>`).join('');
        const riskItems = [];
        if (risk.phase) riskItems.push(`단계 ${risk.phase}`);
        if (risk.grade) riskItems.push(`등급 ${risk.grade}`);
        if (risk.stop) riskItems.push(`손절 ${formatNumber(risk.stop, 0)}`);
        if (risk.stop_distance_pct) riskItems.push(`손절폭 ${formatNumber(risk.stop_distance_pct, 2)}%`);
        const riskMarkup = conditions || riskItems.length ? `<div class="candidate-feature-list">${conditions}${riskItems.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : '';
        return `<div class="candidate-ai-cell"><div class="candidate-score-grid">
            <div><span>규칙</span><strong>${formatNumber(ruleScore, 2)}</strong></div>
            <div><span>AI</span><strong>${mlScore == null ? '-' : formatNumber(mlScore, 2)}</strong></div>
            <div><span>최종</span><strong>${formatNumber(finalScore, 2)}</strong></div>
        </div><div class="candidate-ai-meta">${pill(aiModelStatusLabel(modelStatus), aiModelStatusKind(modelStatus))}<span>${escapeHtml(row.ai_model_version || '-')}</span><span>가중치 ${formatNumber(weight * 100, 0)}%</span></div>
        ${features ? `<div class="candidate-feature-list">${features}</div>` : ''}${riskMarkup}${fallback}</div>`;
    }

    global.HanstockDashboardCandidateStrategy = { render };
})(window);
