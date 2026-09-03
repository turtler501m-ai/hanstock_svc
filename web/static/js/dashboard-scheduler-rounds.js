(function (global) {
    'use strict';

    function emptyRound(time, mode) {
        return { time: time || '', results: [], approved: [], approvalErrors: [], mode };
    }

    function ensure(rounds, round, time, mode) {
        if (!rounds.has(round)) rounds.set(round, emptyRound(time, mode));
        return rounds.get(round);
    }

    function buildRounds({ results = [], approved = [], approvalErrors = [], schedulerRuns = [], fallbackTime = '-', mode } = {}) {
        const rounds = new Map();
        schedulerRuns.forEach((run) => {
            if (!run.round) return;
            rounds.set(run.round, {
                time: run.time || '', results: [], approved: [], approvalErrors: [], mode: run.mode || mode,
                strategyId: run.strategy_id || '', status: run.status || 'completed', message: run.message || '',
                universeCount: Number(run.universe_count || 0), scannedCount: Number(run.scanned_count || 0),
                candidateCount: Number(run.candidate_count || 0), conditionCounts: run.condition_counts || {},
                analysisRows: Array.isArray(run.analysis_rows) ? run.analysis_rows : [],
                marketRegimePolicy: run.market_regime_policy || {}, blocked: Array.isArray(run.blocked) ? run.blocked : [],
            });
        });
        results.forEach((row) => { if (row.round) ensure(rounds, row.round, row.time, mode).results.push(row); });
        approved.forEach((row) => { if (row.round) ensure(rounds, row.round, row.time, mode).approved.push(row); });
        approvalErrors.forEach((row) => { if (row.round) ensure(rounds, row.round, row.time, mode).approvalErrors.push(row); });
        if (!rounds.size && (results.length || approved.length || approvalErrors.length)) {
            rounds.set(1, { time: fallbackTime, results, approved, approvalErrors, mode });
        }
        return rounds;
    }

    global.HanstockDashboardSchedulerRounds = { buildRounds };
})(window);
