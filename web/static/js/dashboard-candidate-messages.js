(function (global) {
    'use strict';

    function scanError(deps, errorMsg) {
        return `<div class="ai-modal-section"><h3>오류 내용</h3><p class="ai-modal-footnote">${deps.escapeHtml(errorMsg)}</p></div>
        <div class="ai-modal-section"><h3>이렇게 해보세요</h3><ul class="ai-modal-list"><li>잠시 후 다시 조회해 보세요.</li><li>인터넷 연결 상태를 확인하세요.</li><li>장중 시간에는 데이터가 안정적으로 수신됩니다.</li></ul></div>`;
    }

    function noCandidates(deps, data) {
        const { escapeHtml, strategyReasonLabel, formatNumber, pill } = deps;
        const summary = data.scan_summary || [];
        const minScore = data.min_score || 2;
        const scanned = data.scanned || summary.length;
        const scoreGroups = {};
        summary.forEach((item) => { const score = item.score || 0; scoreGroups[score] = (scoreGroups[score] || 0) + 1; });
        const scoreItems = Object.entries(scoreGroups).sort((a, b) => Number(b[0]) - Number(a[0]))
            .map(([score, count]) => `<li><strong>${score}점</strong>: ${count}종목</li>`).join('');
        const signals = {};
        summary.forEach((item) => (item.reasons || []).forEach((reason) => { signals[reason] = (signals[reason] || 0) + 1; }));
        const topSignals = Object.entries(signals).sort((a, b) => b[1] - a[1]).slice(0, 4)
            .map(([reason, count]) => `<li>${escapeHtml(strategyReasonLabel(reason))} <span class="muted">(${count}종목)</span></li>`).join('');
        const topRows = summary.slice(0, 8).map((item) => {
            const scoreClass = item.score >= minScore ? 'buy' : (item.score > 0 ? 'warn' : 'sell');
            const reason = (item.reasons || []).map(strategyReasonLabel).join(', ') || '신호 없음';
            const gap = minScore - item.score;
            return `<tr><td>${escapeHtml(item.ticker)}</td><td>${pill(item.score, scoreClass)} ${gap > 0 ? `<span class="muted">(${gap}점 부족)</span>` : '<span class="pill pill-buy">통과</span>'}</td><td>${formatNumber(item.rsi, 1)}</td><td>${formatNumber(item.macd_hist, 1)}</td><td>${escapeHtml(reason)}</td></tr>`;
        }).join('');
        return `<div class="ai-modal-section"><h3>스캔 요약</h3><ul class="ai-modal-list"><li>분석 종목: <strong>${scanned}종목</strong></li><li>매수 기준 점수: <strong>${minScore}점 이상</strong></li><li>매수 후보: <strong>0종목</strong></li></ul></div>
        ${topSignals ? `<div class="ai-modal-section"><h3>가장 많이 부족한 신호</h3><ul class="ai-modal-list">${topSignals}</ul></div>` : ''}
        <div class="ai-modal-section"><h3>점수별 종목 분포</h3><ul class="ai-modal-list">${scoreItems || '<li>분석 데이터 없음</li>'}</ul></div>
        ${topRows ? `<div class="ai-modal-section"><h3>상위 스코어 종목 상세</h3><div class="table-responsive"><table><thead><tr><th>종목</th><th>점수</th><th>RSI</th><th>MACD</th><th>감점 신호</th></tr></thead><tbody>${topRows}</tbody></table></div></div>` : ''}`;
    }

    global.HanstockDashboardCandidateMessages = { scanError, noCandidates };
})(window);
