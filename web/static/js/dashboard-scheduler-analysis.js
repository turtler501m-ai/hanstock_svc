(function (global) {
    'use strict';

    function render(roundData, summary, details, deps) {
        if (summary && roundData.scannedCount > 0) {
            const alpha = roundData.strategyId === 'heikin_ashi_scalping_strategy';
            const labels = alpha
                ? [['history_ready', '500봉 확보'], ['trend_ok', '상승 EMA200'], ['alpha_reversal', 'Alpha HA 상승 반전'], ['price_confirmed', '신호봉 고가 돌파'], ['trend_quality_ok', 'ADX·DI 추세'], ['volatility_ok', 'ATR 변동성'], ['fast_trend_ok', 'EMA10·20 정배열'], ['rsi_momentum_ok', 'RSI 상승 모멘텀'], ['volume_confirmed', '거래량 확인'], ['risk_acceptable', '손절거리 통과'], ['event_safe', '이벤트 위험 없음'], ['entry_ready', '최종 진입 가능']]
                : [['history_ready', '500봉 확보'], ['trend_ok', '상승 EMA200'], ['oversold_seen', 'RSI 과매도 회복'], ['price_confirmed', '직전 고가 돌파'], ['risk_acceptable', '손절거리 통과'], ['event_safe', '이벤트 위험 없음'], ['reentry_reset_ok', '재진입 초기화'], ['entry_ready', '최종 진입 가능']];
            summary.innerHTML = `<h4 style="margin-bottom:.75rem;">후보 분석 집계</h4><p class="section-help">감시 ${roundData.universeCount || roundData.scannedCount}종목 · 분석 ${roundData.scannedCount}종목 · 후보 ${roundData.candidateCount}종목</p><div class="schedule-result-metrics">${labels.map(([key, label]) => `<div class="schedule-result-metric"><span>${label}</span><strong>${Number(roundData.conditionCounts[key] || 0)} / ${roundData.scannedCount}</strong></div>`).join('')}</div>`;
        }
        if (details && roundData.analysisRows.length) {
            const alpha = roundData.strategyId === 'heikin_ashi_scalping_strategy';
            const headers = alpha ? '<th>Alpha 반전</th><th>고가 돌파</th><th>ADX</th><th>ATR</th>' : '<th>RSI 과매도</th><th>고가 돌파</th><th>손절거리</th><th>RSI</th>';
            const cells = (row) => alpha
                ? `<td>${row.checks?.alpha_reversal ? '통과' : '제외'}</td><td>${row.checks?.price_confirmed ? '가점' : '미가점'}</td><td>${row.adx == null ? '-' : deps.formatNumber(row.adx, 1)} · ${row.checks?.trend_quality_ok ? '통과' : '제외'}</td><td>${row.atr_pct == null ? '-' : `${deps.formatNumber(row.atr_pct, 2)}%`} · ${row.checks?.volatility_ok ? '통과' : '제외'}</td>`
                : `<td>${row.checks?.oversold_seen ? '통과' : '제외'}</td><td>${row.checks?.price_confirmed ? '통과' : '제외'}</td><td>${row.stop_distance_pct == null ? '-' : `${deps.formatNumber(row.stop_distance_pct, 2)}%`} · ${row.checks?.risk_acceptable ? '통과' : '제외'}</td><td>${row.rsi == null ? '-' : deps.formatNumber(row.rsi, 1)}</td>`;
            details.innerHTML = `<details><summary><strong>종목별 조건 점검 ${roundData.analysisRows.length}건</strong></summary><div class="table-responsive" style="margin-top:.75rem;"><table style="width:100%;"><thead><tr><th>종목</th><th>점수</th><th>EMA200 추세</th>${headers}<th>결과/사유</th></tr></thead><tbody>${roundData.analysisRows.map((row) => `<tr><td><strong>${deps.escapeHtml(row.name || row.symbol || '-')}</strong><br><small>${deps.escapeHtml(row.symbol || '')}</small></td><td>${deps.formatNumber(row.score || 0, 2)}</td><td>${row.checks?.trend_ok ? '통과' : '제외'}</td>${cells(row)}<td>${row.checks?.entry_ready ? deps.pill('진입 가능', 'buy') : deps.pill('조건 미충족', 'hold')}<br><small>${deps.escapeHtml((row.reasons || []).join(' · '))}</small></td></tr>`).join('')}</tbody></table></div></details>`;
        }
    }

    global.HanstockDashboardSchedulerAnalysis = { render };
})(window);
