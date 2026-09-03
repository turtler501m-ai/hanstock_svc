/* Strategy audit presentation helpers. Loaded before app.js. */
(function (global) {
    const audit = {
        operationText(operation) {
            if (operation?.ready) {
                if (operation.mode === 'demo') return '운영 가능(DEMO)';
                return operation.mode === 'dry_run' ? '운영 가능(DRY_RUN)' : '운영 가능';
            }
            if (operation?.mode === 'inactive') return '미선택';
            return '운영 차단';
        },
        operationKind(operation) {
            if (operation?.ready) return operation.mode === 'dry_run' ? 'warn' : 'buy';
            if (operation?.mode === 'inactive') return 'hold';
            return 'sell';
        },
        summarizeCounts(counts) {
            return Object.entries(counts || {})
                .map(([key, value]) => `${key}:${value}`)
                .join(' / ') || '-';
        },
        eventPayloadSummary(payload) {
            if (!payload) return '-';
            let data = payload;
            if (typeof payload === 'string') {
                try { data = JSON.parse(payload); }
                catch (_err) { return payload.slice(0, 180); }
            }
            if (data.message) return String(data.message);
            if (data.result?.message) return String(data.result.message);
            if (data.warnings?.length) return data.warnings.join(', ');
            if (data.gate?.missing?.length) return `missing ${data.gate.missing.join(', ')}`;
            if (data.performance?.candidate_count !== undefined) return `candidates ${data.performance.candidate_count}`;
            return JSON.stringify(data).slice(0, 180);
        },
        runTime(value) {
            return value ? String(value).replace('T', ' ').slice(0, 19) : '-';
        },
    };
    global.HanstockDashboardStrategyAudit = Object.freeze(audit);
}(window));
