(function (global) {
    'use strict';

    function render(deps, results, strategies = []) {
        const { setCache, getCatalog, displayName, evaluation, sortRows, excludedRows, escapeHtml, formatNumber, formatCurrency, pill, reasonLabel, manualBuy, bindManualBuy } = deps;
        const container = document.getElementById('strategy-preview-results');
        const legacyTable = document.querySelector('.panel-candidates .candidate-legacy-table');
        if (!container) return;
        setCache(results, strategies);
        const map = new Map(strategies.map((strategy) => [String(strategy.id), strategy]));
        container.hidden = false;
        if (legacyTable) legacyTable.hidden = true;
        const analyzed = results.flatMap((result) => result.data?.scan_summary || []);
        const passed = analyzed.filter((row) => row.passed).length;
        const tradePossible = analyzed.filter((row) => evaluation(row).tradePossible).length;
        const scanned = results.reduce((sum, result) => sum + Number(result.data?.scanned || 0), 0);
        const candidates = results.reduce((sum, result) => sum + Number(result.data?.candidates?.length || 0), 0);
        const summary = `<section class="strategy-lookup-detail-summary"><div><span>실행 전략</span><strong>${results.length}개</strong></div><div><span>전체 분석</span><strong>${scanned.toLocaleString()}종목</strong></div><div><span>전략 통과</span><strong>${passed.toLocaleString()}종목</strong></div><div><span>매매 가능</span><strong>${tradePossible.toLocaleString()}종목</strong></div><div><span>후보 목록</span><strong>${candidates.toLocaleString()}종목</strong></div></section>`;
        container.innerHTML = summary + results.map((result) => {
            const strategy = map.get(String(result.strategyId)) || getCatalog().find((item) => String(item.id) === String(result.strategyId)) || { id: result.strategyId, name: result.strategyId };
            const data = result.data || {};
            const rows = data.candidates || [];
            const analysisRows = (data.scan_summary || []).map((row) => ({ ...row, strategy_id: row.strategy_id || result.strategyId, strategy_version: row.strategy_version || strategy.strategy_version || null, profile_hash: row.profile_hash || strategy.profile_hash || '' }));
            const sortKey = deps.getSortKey(String(result.strategyId));
            const sorted = sortRows(analysisRows, sortKey);
            const error = result.error || data.scan_error;
            const cache = data._cache || {};
            const candidateRows = rows.slice(0, 10).map((row) => {
                const reasons = (row.reasons || []).map(reasonLabel).join(' · ') || '-';
                return `<tr><td><span class="symbol-name">${escapeHtml(row.name || row.ticker)}</span><span class="symbol-code">${escapeHtml(row.ticker || '')}</span></td><td>${pill(formatNumber(row.score, 2), Number(row.score) >= 3 ? 'buy' : 'warn')}</td><td>${formatCurrency(row.current_price)}</td><td>${Number(row.planned_qty || 0).toLocaleString()}</td><td>${formatCurrency(row.estimated_cost)}</td><td>${pill(row.order_plan_status || (Number(row.planned_qty || 0) > 0 ? '매수 계획 가능' : '매수 계획 미생성'), Number(row.planned_qty || 0) > 0 ? 'buy' : 'warn')}</td><td>${escapeHtml(reasons)}</td><td>${manualBuy({ ...row, strategy_id: row.strategy_id || result.strategyId, strategy_version: row.strategy_version || strategy.strategy_version, profile_hash: row.profile_hash || strategy.profile_hash || '' }, Number(row.planned_qty || 0) > 0 ? '매수 계획 가능' : '매수 계획 미생성')}</td></tr>`;
            }).join('') || `<tr><td colspan="8" class="table-message">${result.updating && cache.missing ? '이전 결과가 없어 분석 중입니다...' : error ? `조회 실패: ${escapeHtml(String(error))}` : `${Number(data.scanned || 0).toLocaleString()}종목 분석, 기준 충족 후보 없음`}</td></tr>`;
            return `<article class="strategy-preview-card"><header><div><h3>${escapeHtml(displayName(strategy))}</h3><small>${escapeHtml(String(strategy.id || result.strategyId))}</small></div><div class="strategy-preview-metrics"><span>분석 <strong>${Number(data.scanned || 0).toLocaleString()}</strong></span><span>후보 <strong>${rows.length.toLocaleString()}</strong></span><span class="${error ? 'is-error' : 'is-complete'}">${error ? '오류' : (result.updating ? '업데이트 중' : '최신 결과')}</span></div></header><div class="table-responsive"><table><thead><tr><th>종목</th><th>점수</th><th>현재가</th><th>예상수량</th><th>예상금액</th><th>매수계획</th><th>판단 근거</th><th>수동 처리</th></tr></thead><tbody>${candidateRows}</tbody></table></div><details class="strategy-analysis-details"><summary>분석 상세 ${analysisRows.length}건</summary><div class="strategy-analysis-toolbar"><label>정렬 <select class="strategy-analysis-sort" data-strategy-id="${escapeHtml(String(result.strategyId))}"><option value="score_desc" ${sortKey === 'score_desc' ? 'selected' : ''}>점수 높은 순</option><option value="score_asc" ${sortKey === 'score_asc' ? 'selected' : ''}>점수 낮은 순</option><option value="failed_desc" ${sortKey === 'failed_desc' ? 'selected' : ''}>미충족 많은 순</option><option value="verdict" ${sortKey === 'verdict' ? 'selected' : ''}>매매 가능 우선</option><option value="name" ${sortKey === 'name' ? 'selected' : ''}>종목명 순</option></select></label></div><div class="table-responsive"><table class="strategy-analysis-table"><thead><tr><th>종목</th><th>점수/기준</th><th>체크 점수</th><th>판정</th><th>체크 항목</th><th>사유</th><th>미충족</th><th>수동 처리</th></tr></thead><tbody>${excludedRows(sorted)}</tbody></table></div></details></article>`;
        }).join('');
        container.querySelectorAll('.strategy-analysis-sort').forEach((select) => select.addEventListener('change', () => { deps.setSortKey(String(select.dataset.strategyId), select.value); render(deps, deps.getCache(), deps.getCatalog()); }));
        bindManualBuy(container);
    }

    global.HanstockDashboardStrategyPreviewScreen = { render };
})(window);
