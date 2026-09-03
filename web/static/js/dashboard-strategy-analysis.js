(function (global) {
    'use strict';

    function checks(deps, row) {
        const { formatNumber, formatCurrency, reasonLabel } = deps;
        const risk = row.strategy_risk || {};
        const params = risk.effective_parameters || {};
        const value = (label, passed, detail = '') => ({ label, passed: Boolean(passed), detail });
        if (String(row.strategy_id || '').includes('heikin_ashi')) {
            const min = Number(params.atr_pct_min ?? 0.5);
            const max = Number(params.atr_pct_max ?? 5);
            const adx = Number(params.adx_min ?? 20);
            return [value('Alpha HA 진입 상태', risk.long_setup || risk.short_setup), value('EMA200 추세 방향', risk.direction && risk.direction !== 'flat', `방향 ${risk.direction || '-'}`), value(`ADX ${adx} 이상`, Number(risk.adx) >= adx, `ADX ${formatNumber(risk.adx, 1)}`), value(`ATR ${min}~${max}%`, Number(risk.atr_pct) >= min && Number(risk.atr_pct) <= max, `ATR ${formatNumber(risk.atr_pct, 2)}%`)];
        }
        if (String(row.strategy_id || '').includes('rsi_limit')) {
            return [value('EMA200 추세', risk.trend_ok, `현재 ${formatCurrency(row.current_price)} · EMA ${formatCurrency(risk.ema200)}`), value(`RSI 과매도 ${Number(params.oversold_threshold ?? 30)} 이하`, risk.oversold_seen, `RSI ${formatNumber(risk.rsi, 1)}`), value('RSI 반등 확인', risk.rsi_recovered), value('직전 고점 돌파', risk.price_confirmed), value('거래량 확인', risk.volume_confirmed, `20일 대비 ${formatNumber(row.feature_payload?.volume_ratio_20d, 2)}배`), value('손절 위험 허용', risk.risk_acceptable, `손절폭 ${formatNumber(risk.stop_distance_pct, 2)}%`), value('재진입 제한 해제', risk.reentry_reset_ok)];
        }
        return (row.reasons || []).map((reason) => value(reasonLabel(reason), row.passed));
    }

    function evaluate(deps, row) {
        const list = checks(deps, row);
        const passed = list.filter((item) => item.passed).length;
        const score = list.length ? Math.round((passed / list.length) * 100) : 0;
        const strategyScore = Number(row.score || 0);
        const minScore = Number(row.min_score || 0);
        const tradePossible = Boolean(row.passed) && strategyScore >= minScore && score === 100;
        return { checks: list, checklistScore: score, failedCount: list.length - passed, tradePossible, verdict: tradePossible ? '매매 가능' : (score >= 60 ? '관찰' : '제외') };
    }

    function checklistMarkup(deps, row) {
        return checks(deps, row).map((check) => `<li class="${check.passed ? 'is-pass' : 'is-fail'}"><span aria-hidden="true">${check.passed ? '✓' : '×'}</span><strong>${deps.escapeHtml(check.label)}</strong>${check.detail ? `<small>${deps.escapeHtml(check.detail)}</small>` : ''}</li>`).join('');
    }

    function sort(deps, rows, sortKey) {
        return [...rows].sort((left, right) => {
            const a = evaluate(deps, left); const b = evaluate(deps, right);
            if (sortKey === 'score_asc') return a.checklistScore - b.checklistScore;
            if (sortKey === 'failed_desc') return b.failedCount - a.failedCount;
            if (sortKey === 'name') return String(left.name || left.ticker || '').localeCompare(String(right.name || right.ticker || ''), 'ko');
            if (sortKey === 'verdict') return Number(b.tradePossible) - Number(a.tradePossible) || b.checklistScore - a.checklistScore;
            return b.checklistScore - a.checklistScore || Number(right.score || 0) - Number(left.score || 0);
        });
    }

    function excludedRows(deps, rows) {
        if (!rows.length) return '<tr><td colspan="8" class="table-message">분석 상세 내역이 없습니다.</td></tr>';
        return rows.map((row) => {
            const evaluation = evaluate(deps, row);
            const failed = evaluation.checks.filter((item) => !item.passed);
            const reasons = (row.reasons || []).map(deps.reasonLabel).join(' · ') || '진입 기준 미충족';
            return `<tr><td><span class="symbol-name">${deps.escapeHtml(row.name || row.ticker)}</span><span class="symbol-code">${deps.escapeHtml(row.ticker || '')}</span></td><td>${deps.formatNumber(row.score, 2)} / ${deps.formatNumber(row.min_score, 2)}</td><td><strong>${evaluation.checklistScore}%</strong> / 100%</td><td>${deps.pill(evaluation.verdict, evaluation.tradePossible ? 'buy' : (evaluation.verdict === '관찰' ? 'warn' : 'sell'))}</td><td><ul class="strategy-analysis-checklist">${checklistMarkup(deps, row)}</ul></td><td><div class="reason-detail">${deps.escapeHtml(reasons)}</div></td><td>${failed.length.toLocaleString()}개</td><td>${deps.manualBuy(row, evaluation.verdict)}</td></tr>`;
        }).join('');
    }

    global.HanstockDashboardStrategyAnalysis = { checks, evaluate, checklistMarkup, sort, excludedRows };
})(window);
