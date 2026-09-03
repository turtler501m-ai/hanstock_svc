(function (global) {
    'use strict';

    function create(round, data, expanded, deps) {
        const planCount = data.results.length;
        const approvedCount = data.approved.length + data.approvalErrors.length;
        const successCount = data.approved.filter((item) => item.status === 'executed').length;
        const failedCount = data.approved.filter((item) => item.status === 'failed').length + data.approvalErrors.length;
        const hasFailure = failedCount > 0 || data.status === 'failed' || data.status === 'partial';
        const blocked = data.status === 'blocked';
        const status = ({ success: '정상 완료', partial: '일부 실패', failed: '실패', blocked: '실행 차단', skipped: '건너뜀' })[data.status] || data.status || '상태 불명';
        const policy = data.marketRegimePolicy || {};
        const allowed = policy.allowed !== false;
        const policySummary = policy.regime
            ? `${deps.marketRegimeLabel(policy.regime)} · 수급 ${deps.marketRegimePercent(policy.source_multiplier, 0)} · 전략 상한 ${deps.marketRegimePercent(policy.configured_max_pct, 0)} · 최종 ${deps.marketRegimePercent(Number(policy.multiplier || 0), 0)} · ${allowed ? '신규 매수 허용' : '신규 매수 차단'}`
            : '실행 당시 시장 국면 규칙 기록 없음';
        const policyReason = deps.marketPolicyReasonLabel(policy.reason) || (data.blocked || []).map(deps.marketPolicyReasonLabel).join(', ');
        const card = document.createElement('div');
        card.className = 'card glass scheduler-round-card';
        card.innerHTML = `
            <div class="round-header scheduler-round-header" onclick="toggleRoundCollapse(${round})">
                <div class="scheduler-round-heading">
                    <span class="badge scheduler-round-number">${round}차 실행</span>
                    <span class="scheduler-round-time">◷ ${data.time || '-'}</span>
                    <span class="badge scheduler-round-mode">${data.mode === 'daily_auto' ? 'AI 자동매매' : (data.mode === 'execute' ? '주문 실행' : '분석 전용')}${data.strategyId ? ` · ${deps.escapeHtml(data.strategyId)}` : ''}</span>
                </div>
                <div class="scheduler-round-actions">
                    <span class="scheduler-round-metrics d-none d-sm-inline">계획 <strong>${planCount}</strong>건 · 승인 <strong class="is-approved">${approvedCount}</strong>건 · 성공 <strong class="is-success">${successCount}</strong>건 · 실패 <strong class="is-failed">${failedCount}</strong>건</span>
                    <span class="badge scheduler-round-status ${hasFailure ? 'is-failed' : (blocked ? 'is-blocked' : 'is-success')}">${deps.escapeHtml(status)}</span>
                    <i class="fas fa-chevron-down toggle-icon scheduler-round-toggle ${expanded ? 'is-expanded' : ''}" id="toggle-icon-${round}"></i>
                </div>
            </div>
            <div class="round-body scheduler-round-body" id="round-body-${round}" style="display: ${expanded ? 'block' : 'none'};">
                <div class="scheduler-regime-policy ${allowed ? 'is-allowed' : 'is-blocked'}"><strong>실행 적용 시장 국면</strong><span>${deps.escapeHtml(policySummary)}</span>${policyReason ? `<small>${deps.escapeHtml(policyReason)}</small>` : ''}</div>
                ${data.message ? `<div class="scheduler-status-message"><strong>상태 메시지</strong><span>${deps.escapeHtml(data.message)}</span></div>` : ''}
                <div class="scheduler-analysis-summary scheduler-round-section"></div>
                <div class="scheduler-analysis-details scheduler-round-section"></div>
                <h4 class="scheduler-round-section-title">자동 승인 및 주문 전송 내역</h4>
                <div class="table-responsive scheduler-round-table-wrap is-orders"><table class="table-orders scheduler-table"><thead><tr><th>주문ID</th><th>종목코드</th><th>종목명</th><th>전략</th><th>구분</th><th>수량</th><th>가격</th><th>상태</th><th>응답 메시지</th></tr></thead><tbody></tbody></table></div>
                <h4 class="scheduler-round-section-title">생성된 매매 계획 및 판단</h4>
                <div class="table-responsive scheduler-round-table-wrap"><table class="table-plans scheduler-table"><thead><tr><th>종목코드</th><th>종목명</th><th>전략</th><th>분류</th><th>결정</th><th>수량</th><th>가격</th><th>근거</th></tr></thead><tbody></tbody></table></div>
            </div>`;
        return card;
    }

    global.HanstockDashboardSchedulerRoundCard = { create };
})(window);
