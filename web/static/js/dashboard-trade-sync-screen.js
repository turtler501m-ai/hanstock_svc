/* Trade synchronization result rendering. Loaded before app.js. */
(function (global) {
    function renderTradeSyncResult(result, deps) {
        const container = document.getElementById('trade-sync-last-result');
        if (!container || !result || result.available === false) return;
        const summary = document.getElementById('trade-sync-result-summary');
        const time = document.getElementById('trade-sync-result-time');
        const error = document.getElementById('trade-sync-result-error');
        const details = document.getElementById('trade-sync-result-details');
        const detailTitle = document.getElementById('trade-sync-detail-title');
        const count = document.getElementById('trade-sync-result-count');
        const tbody = document.querySelector('#table-trade-sync-items tbody');
        const runsTbody = document.querySelector('#table-trade-sync-runs tbody');
        container.hidden = false;
        container.style.display = 'grid';
        deps.updateButton(result);
        if (summary) summary.textContent = `${deps.labels.added} ${Number(result.synced_count || 0)} · ${deps.labels.removed} ${Number(result.removed_mismatch_count || 0)} · ${deps.labels.imported} ${Number(result.history_imported_count || 0)} · ${deps.labels.updated} ${Number(result.history_updated_count || 0)}`;
        if (time) {
            const completedAt = result.completed_at ? new Date(result.completed_at) : null;
            time.textContent = completedAt && !Number.isNaN(completedAt.getTime()) ? `${deps.labels.completed}: ${completedAt.toLocaleString('ko-KR')}` : '';
        }
        const errors = [result.error, result.history_error, result.order_status_error].filter(Boolean);
        if (error) {
            error.hidden = errors.length === 0;
            error.textContent = errors.length ? `${deps.labels.error}: ${errors.join(' / ')}` : '';
        }
        const renderItems = (run) => {
            const items = Array.isArray(run.sync_items) ? run.sync_items : [];
            if (details) details.hidden = false;
            if (detailTitle) {
                const completedAt = run.completed_at ? new Date(run.completed_at) : null;
                detailTitle.textContent = completedAt && !Number.isNaN(completedAt.getTime()) ? completedAt.toLocaleString('ko-KR') : deps.labels.selected;
            }
            if (count) count.textContent = `(${Number(run.sync_item_count ?? items.length).toLocaleString()}${deps.labels.items})`;
            if (!tbody) return;
            tbody.innerHTML = items.length ? items.map((item) => {
                const action = String(item.action || '').toLowerCase();
                const actionLabel = action === 'buy' ? deps.labels.buy : action === 'sell' ? deps.labels.sell : '-';
                return `<tr><td>${deps.escapeHtml(deps.typeLabels[item.sync_type] || item.sync_type || '-')}</td><td>${deps.escapeHtml(deps.resultLabels[item.sync_result] || item.sync_result || '-')}</td><td>${deps.escapeHtml(item.ts || '-')}</td><td><strong>${deps.escapeHtml(item.name || item.symbol || '-')}</strong>${item.symbol ? `<div class="time-muted">${deps.escapeHtml(item.symbol)}</div>` : ''}</td><td>${deps.escapeHtml(actionLabel)}</td><td>${Number(item.qty || 0).toLocaleString()}</td><td>${Number(item.price || 0) > 0 ? deps.formatCurrency(item.price) : '-'}</td><td>${deps.escapeHtml(item.broker_order_id || '-')}</td><td>${deps.escapeHtml(deps.orderStatusLabel(item.order_status) || '-')}</td><td><div class="reason-cell" title="${deps.escapeHtml(item.message || '')}">${deps.escapeHtml(item.message || '-')}</div></td></tr>`;
            }).join('') : `<tr><td colspan="10">${deps.labels.noItems}</td></tr>`;
        };
        const runs = Array.isArray(result.runs) && result.runs.length ? result.runs : [result];
        if (runsTbody) {
            runsTbody.innerHTML = runs.map((run, index) => {
                const completedAt = run.completed_at ? new Date(run.completed_at) : null;
                const completedLabel = completedAt && !Number.isNaN(completedAt.getTime()) ? completedAt.toLocaleString('ko-KR') : '-';
                const itemCount = Number(run.sync_item_count ?? (Array.isArray(run.sync_items) ? run.sync_items.length : 0));
                const changed = Number(run.history_imported_count || 0) + Number(run.history_updated_count || 0);
                const status = run.status === 'running' ? deps.labels.running : (run.status === 'failed' || run.ok === false ? deps.labels.failed : deps.labels.done);
                return `<tr><td><button type="button" class="trade-sync-run-button" data-run-index="${index}">${deps.escapeHtml(completedLabel)}</button></td><td>${itemCount.toLocaleString()}${deps.labels.items}</td><td>${changed.toLocaleString()}${deps.labels.items}</td><td>${Number(run.balance_synced_count || 0).toLocaleString()}${deps.labels.items}</td><td>${Number(run.removed_mismatch_count || 0).toLocaleString()}${deps.labels.items}</td><td>${status}${run.error ? `<div class="time-muted" title="${deps.escapeHtml(run.error)}">${deps.escapeHtml(run.error)}</div>` : ''}</td></tr>`;
            }).join('');
            runsTbody.querySelectorAll('.trade-sync-run-button').forEach((button) => {
                button.addEventListener('click', async () => {
                    const run = runs[Number(button.dataset.runIndex || 0)];
                    if (!run) return;
                    button.disabled = true;
                    try {
                        const detail = await deps.fetchJson(`/api/trades/sync/runs/${encodeURIComponent(run.run_id)}`, 30000);
                        renderItems(detail);
                        if (details) details.open = true;
                        details?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    } catch (loadError) {
                        deps.setStatus(`${deps.labels.detailFailed}: ${loadError.message}`);
                    } finally {
                        button.disabled = false;
                    }
                });
            });
        }
        renderItems(runs[0] || result);
    }
    global.HanstockDashboardTradeSyncScreen = Object.freeze({ render: renderTradeSyncResult });
}(window));
