(function (global) {
    'use strict';

    async function render(deps) {
        const { fetchJson, escapeHtml, runTime, openRun } = deps;
        const container = document.getElementById('strategy-lookup-history');
        if (!container) return;
        try {
            const envelope = await fetchJson('/api/strategy-lookup/runs?limit=50', 30000);
            const runs = envelope.runs || [];
            container.innerHTML = `<div class="strategy-lookup-history-header">
            <div><strong>분석 실행 이력</strong><small>최근 분석 실행 결과를 확인하고 선택한 실행의 종목 목록을 다시 표시합니다.</small></div>
            <span class="strategy-lookup-total">전체 <strong>${Number(envelope.total_count || 0).toLocaleString()}</strong>건</span>
        </div>${runs.length ? `<div class="table-responsive strategy-lookup-run-list"><table>
                <thead><tr><th>번호</th><th>실행 시각</th><th>전략</th><th>전체 분석</th><th>매매 후보</th><th>상세 목록</th></tr></thead>
                <tbody>${runs.map((run, index) => `<tr class="strategy-lookup-run" data-run-id="${escapeHtml(run.run_id)}" tabindex="0">
                    <td>${Number(envelope.total_count || runs.length) - index}</td>
                    <td><strong>${escapeHtml(runTime(run.captured_at))}</strong></td>
                    <td>${Number(run.strategy_count || 0).toLocaleString()}개</td>
                    <td>${Number(run.scanned || 0).toLocaleString()}종목</td>
                    <td>${Number(run.candidate_count || 0).toLocaleString()}종목</td>
                    <td><button type="button" class="button-ghost">보기</button></td>
                </tr>`).join('')}</tbody>
            </table></div>` : '<p class="section-help">저장된 분석 실행이 없습니다.</p>'}`;
            container.querySelectorAll('.strategy-lookup-run').forEach((row) => {
                const open = async () => {
                    container.querySelectorAll('.strategy-lookup-run').forEach((item) => item.classList.remove('is-active'));
                    row.classList.add('is-active');
                    await openRun(row.dataset.runId);
                };
                row.addEventListener('click', open);
                row.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') open();
                });
            });
        } catch (error) {
            container.innerHTML = `<p class="section-help">분석 실행 목록을 불러오지 못했습니다. ${escapeHtml(error.message)}</p>`;
        }
    }

    global.HanstockDashboardStrategyLookupHistory = { render };
})(window);
