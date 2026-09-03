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
            ? `${deps.marketRegimeLabel(policy.regime)} · 수집 ${deps.marketRegimePercent(policy.source_multiplier, 0)} · 전략 상한 ${deps.marketRegimePercent(policy.configured_max_pct, 0)} · 최종 ${deps.marketRegimePercent(Number(policy.multiplier || 0), 0)} · ${allowed ? '신규매수 허용' : '신규매수 차단'}`
            : '실행 당시 시장 국면 규칙 기록 없음';
        const policyReason = deps.marketPolicyReasonLabel(policy.reason) || (data.blocked || []).map(deps.marketPolicyReasonLabel).join(', ');
        const card = document.createElement('div');
        card.className = 'card glass scheduler-round-card';
        card.style.cssText = 'margin-bottom: 1.25rem; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--bg-card); box-shadow: 0 4px 15px rgba(0,0,0,0.15);';
        card.innerHTML = `
            <div class="round-header" style="padding: 1rem 1.25rem; display: flex; justify-content: space-between; align-items: center; cursor: pointer; background: rgba(255, 255, 255, 0.02); transition: background 0.2s;" onclick="toggleRoundCollapse(${round})">
                <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                    <span class="badge" style="background: var(--primary); color: #fff; padding: 0.25rem 0.5rem; font-size: 0.8rem; font-weight: 600; border-radius: 4px;">${round}차 실행</span>
                    <span style="font-weight: 500; font-size: 0.95rem; color: var(--text);">◷ ${data.time || '-'}</span>
                    <span class="badge" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--text-muted); font-size: 0.75rem; padding: 0.15rem 0.4rem; border-radius: 4px;">${data.mode === 'daily_auto' ? 'AI 자동매매' : (data.mode === 'execute' ? '주문 실행' : '분석 전용')}${data.strategyId ? ` · ${deps.escapeHtml(data.strategyId)}` : ''}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <span style="font-size: 0.85rem; color: var(--text-muted);" class="d-none d-sm-inline">계획 <strong style="color: var(--text);">${planCount}</strong>건 · 승인 <strong style="color: var(--success);">${approvedCount}</strong>건 · 성공 <strong style="color: var(--success);">${successCount}</strong>건 · 실패 <strong style="color: var(--danger);">${failedCount}</strong>건</span>
                    <span class="badge" style="color: ${hasFailure ? 'var(--danger)' : (blocked ? '#f59e0b' : 'var(--success)')};">${deps.escapeHtml(status)}</span>
                    <i class="fas fa-chevron-down toggle-icon" id="toggle-icon-${round}" style="transition: transform 0.2s; color: var(--text-muted); transform: ${expanded ? 'rotate(180deg)' : 'rotate(0deg)'};"></i>
                </div>
            </div>
            <div class="round-body" id="round-body-${round}" style="display: ${expanded ? 'block' : 'none'}; padding: 1.25rem; border-top: 1px solid var(--border); background: rgba(0, 0, 0, 0.05);">
                <div class="scheduler-regime-policy ${allowed ? 'is-allowed' : 'is-blocked'}"><strong>실행 적용 시장 국면</strong><span>${deps.escapeHtml(policySummary)}</span>${policyReason ? `<small>${deps.escapeHtml(policyReason)}</small>` : ''}</div>
                ${data.message ? `<div class="scheduler-status-message"><strong>상태 메시지</strong><span>${deps.escapeHtml(data.message)}</span></div>` : ''}
                <div class="scheduler-analysis-summary" style="margin-bottom:1.5rem;"></div>
                <div class="scheduler-analysis-details" style="margin-bottom:1.5rem;"></div>
                <h4 style="margin-bottom: 0.75rem; font-size: 0.95rem; font-weight: 500;">자동 승인 및 주문 전송 내역</h4>
                <div class="table-responsive" style="margin-bottom: 1.5rem; border-radius: 6px; border: 1px solid var(--border); overflow: hidden;"><table class="table-orders" style="width: 100%; border-collapse: collapse;"><thead><tr><th>주문ID</th><th>종목코드</th><th>종목명</th><th>전략</th><th>구분</th><th>수량</th><th>가격</th><th>상태</th><th>응답 메세지</th></tr></thead><tbody></tbody></table></div>
                <h4 style="margin-bottom: 0.75rem; font-size: 0.95rem; font-weight: 500;">생성된 매매 계획 및 판단</h4>
                <div class="table-responsive" style="border-radius: 6px; border: 1px solid var(--border); overflow: hidden;"><table class="table-plans" style="width: 100%; border-collapse: collapse;"><thead><tr><th>종목코드</th><th>종목명</th><th>전략</th><th>분류</th><th>결정</th><th>수량</th><th>가격</th><th>근거</th></tr></thead><tbody></tbody></table></div>
            </div>`;
        return card;
    }

    global.HanstockDashboardSchedulerRoundCard = { create };
})(window);
