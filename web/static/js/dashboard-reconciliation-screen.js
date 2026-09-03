/* Reconciliation issue table rendering. Loaded before app.js. */
(function (global) {
    async function renderReconciliationIssues(deps) {
        const tbody = document.querySelector('#table-reconciliation-issues tbody');
        if (!tbody) return 0;
        try {
            const data = await deps.fetchJson('/api/reconciliation/issues?status=open&limit=500');
            const rows = Array.isArray(data.items) ? data.items : [];
            const summary = document.getElementById('reconciliation-summary');
            const applyButton = document.getElementById('btn-apply-broker-balance');
            if (summary) {
                summary.textContent = rows.length ? `${rows.length} ${deps.labels.openIssues}` : deps.labels.noIssues;
                summary.classList.toggle('status-fail', rows.length > 0);
                summary.classList.toggle('status-ok', rows.length === 0);
            }
            if (applyButton) applyButton.disabled = rows.length === 0;
            if (!rows.length) {
                deps.setTableMessage('#table-reconciliation-issues tbody', 7, deps.labels.noIssues);
                return 0;
            }
            tbody.innerHTML = rows.map((row) => {
                const difference = Number(row.difference_qty || 0);
                return `<tr><td>#${deps.escapeHtml(row.id || '-')}</td><td><div class="symbol-name">${deps.escapeHtml(row.symbol || '-')}</div></td><td>${Number(row.broker_qty || 0).toLocaleString()}${deps.labels.quantity}</td><td>${Number(row.internal_qty || 0).toLocaleString()}${deps.labels.quantity}</td><td class="${difference === 0 ? '' : 'text-danger'}">${difference > 0 ? '+' : ''}${difference.toLocaleString()}${deps.labels.quantity}</td><td><div class="reason-cell" title="${deps.escapeHtml(row.reason || '')}">${deps.escapeHtml(deps.reasonLabel(row.reason))}</div></td><td>${deps.escapeHtml(deps.formatCheckedAt(row.created_at))}</td></tr>`;
            }).join('');
            return rows.length;
        } catch (error) {
            deps.setTableMessage('#table-reconciliation-issues tbody', 7, error.message);
            return 0;
        }
    }
    global.HanstockDashboardReconciliationScreen = Object.freeze({ render: renderReconciliationIssues });
}(window));
