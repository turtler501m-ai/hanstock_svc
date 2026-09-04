(function (global) {
    'use strict';

    function render(lastResult, results, approved, approvalErrors, schedulerRuns, deps) {
        const summaryCounts = lastResult.result.summary_counts || {};
        const runErrors = lastResult.result.errors || lastResult.result.retry_errors || [];
        const totalPlanCount = summaryCounts.plan_count ?? results.length;
        const queuedCreatedCount = results.filter((row) => row.decision === 'queue').length;
        const totalQueuedCount = summaryCounts.queue_count ?? Math.max(0, queuedCreatedCount - approved.length - approvalErrors.length);
        const totalApprovedCount = summaryCounts.approved_count ?? approved.length + approvalErrors.length;
        const totalSuccessCount = summaryCounts.success_count ?? approved.filter((row) => row.status === 'executed').length;
        const totalFailedCount = summaryCounts.failed_count ?? approved.filter((row) => row.status === 'failed').length + approvalErrors.length + runErrors.length;
        const counts = {
            success: Number(summaryCounts.run_success_count ?? schedulerRuns.filter((run) => run.status === 'success').length),
            partial: Number(summaryCounts.run_partial_count ?? schedulerRuns.filter((run) => run.status === 'partial').length),
            failed: Number(summaryCounts.run_failed_count ?? schedulerRuns.filter((run) => run.status === 'failed').length),
            blocked: Number(summaryCounts.run_blocked_count ?? schedulerRuns.filter((run) => run.status === 'blocked').length),
            skipped: Number(summaryCounts.run_skipped_count ?? schedulerRuns.filter((run) => run.status === 'skipped').length),
        };
        const values = {
            'sched-run-success-cnt': counts.success,
            'sched-run-failed-cnt': counts.failed + counts.partial,
            'sched-run-blocked-cnt': counts.blocked,
            'sched-run-skipped-cnt': counts.skipped,
            'sched-result-plan-cnt': totalPlanCount,
            'sched-result-queue-cnt': totalQueuedCount,
            'sched-result-approved-cnt': totalApprovedCount,
            'sched-result-success-cnt': totalSuccessCount,
            'sched-result-failed-cnt': totalFailedCount,
        };
        Object.entries(values).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = `${value}건`;
        });
        const successBuy = Number(summaryCounts.success_buy_count ?? approved.filter((row) => row.status === 'executed' && row.action === 'buy').length);
        const successSell = Number(summaryCounts.success_sell_count ?? approved.filter((row) => row.status === 'executed' && row.action === 'sell').length);
        const failedBuy = Number(summaryCounts.failed_buy_count ?? approved.filter((row) => ['failed', 'broker_unknown', 'rejected'].includes(row.status) && row.action === 'buy').length);
        const failedSell = Number(summaryCounts.failed_sell_count ?? approved.filter((row) => ['failed', 'broker_unknown', 'rejected'].includes(row.status) && row.action === 'sell').length);
        const successBreakdown = document.getElementById('sched-result-success-breakdown');
        const failedBreakdown = document.getElementById('sched-result-failed-breakdown');
        if (successBreakdown) successBreakdown.textContent = `매수 ${successBuy} / 매도 ${successSell}`;
        if (failedBreakdown) failedBreakdown.textContent = `매수 ${failedBuy} / 매도 ${failedSell}`;
        const status = String(lastResult.result.execution_status || lastResult.result.status || 'success');
        const statusElement = document.getElementById('sched-result-status');
        if (statusElement) {
            const labels = { success: '정상 완료', partial: '일부 실패', failed: '실패', blocked: '실행 차단', skipped: '건너뜀' };
            const failure = status === 'failed' || status === 'partial';
            const warning = status === 'blocked' || status === 'skipped';
            statusElement.textContent = labels[status] || status;
            statusElement.className = failure ? 'badge badge-danger' : (warning ? 'badge badge-warning' : 'badge badge-success');
            statusElement.style.color = failure ? 'var(--danger)' : (warning ? '#f59e0b' : 'var(--success)');
        }
        return { aggregateStatus: status, runErrors };
    }

    global.HanstockDashboardSchedulerSummary = { render };
})(window);
