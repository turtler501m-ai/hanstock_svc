/* AI allocation screen orchestration. Loaded before app.js. */
(function (global) {
    async function renderAiAllocation(deps) {
        deps.setButtonBusy('btn-ai-allocation', true);
        deps.setTableMessage('#table-ai-allocation tbody', 8, 'AI 목표 비중을 계산하고 있습니다...');
        try {
            const data = await deps.fetchJson('/api/ai-allocation', 45000);
            const tbody = document.querySelector('#table-ai-allocation tbody');
            if (!tbody) return;
            tbody.innerHTML = '';
            if (!data.positions.length) {
                deps.setTableMessage('#table-ai-allocation tbody', 8, '계산할 보유 종목이 없습니다');
                return;
            }
            data.positions.forEach((row) => {
                const action = String(row.rebalance_action || 'hold').toLowerCase();
                const kind = action === 'buy' ? 'buy' : action === 'sell' ? 'sell' : 'hold';
                const reason = `AI 목표비중 ${deps.formatNumber(row.target_weight * 100, 1)}%; ${deps.translateReason((row.reasons || []).slice(0, 3).join(', '))}`;
                const modalPayload = encodeURIComponent(JSON.stringify({
                    symbol: row.symbol, name: row.name, action, score: Number(row.score || 0),
                    currentWeight: Number(row.current_weight || 0), targetWeight: Number(row.target_weight || 0),
                    deltaValue: Number(row.delta_value || 0), volatility: Number(row.volatility || 0),
                    reasoning_kr: row.reasoning_kr || '', ai_strategy_name: row.ai_strategy_name || 'AI 전략 상세',
                    reasons: Array.isArray(row.reasons) ? row.reasons : [],
                }));
                const queueButton = action === 'hold'
                    ? '<button type="button" class="button-ghost" disabled title="AI가 현재 비중을 유지할 것을 권장합니다." style="opacity:0.3; cursor:not-allowed;">유지</button>'
                    : `<button type="button" class="button-ghost queue-order" data-symbol="${deps.escapeHtml(row.symbol)}" data-name="${deps.escapeHtml(row.name)}" data-action="${deps.escapeHtml(action)}" data-qty="${Number(row.rebalance_qty || 0)}" data-price="${Number(row.price || 0)}" data-reason="${deps.escapeHtml(reason)}" data-source="ai-allocation" data-strategy-id="${deps.escapeHtml(row.strategy_id || '')}" data-strategy-version="${deps.escapeHtml(row.strategy_version || '')}" data-profile-hash="${deps.escapeHtml(row.profile_hash || '')}">승인대기</button>`;
                const tr = document.createElement('tr');
                const aiReasonText = String(row.reasoning_kr || row.reasons?.join(', ') || '-');
                tr.innerHTML = `<td><div class="symbol-name">${deps.escapeHtml(row.name)}</div><div class="symbol-code">${deps.escapeHtml(row.symbol)}</div></td><td>${deps.pill(deps.formatNumber(row.score, 2), Number(row.score || 0) > 0 ? 'buy' : 'hold')}</td><td>${deps.formatNumber(row.current_weight * 100, 1)}%</td><td>${deps.formatNumber(row.target_weight * 100, 1)}%</td><td>${deps.formatCurrency(row.delta_value)}</td><td>${deps.pill(deps.toKorAction(action), kind)}</td><td><button type="button" class="clickable-reason" data-ai-payload="${modalPayload}" data-reason="${deps.escapeHtml(aiReasonText)}" onclick="showAiModal(this)">${deps.escapeHtml(row.ai_strategy_name || '전략 상세 내역 보기')}</button></td><td>${queueButton}</td>`;
                tbody.appendChild(tr);
            });
            deps.bindQueueButtons();
        } catch (error) {
            deps.setTableMessage('#table-ai-allocation tbody', 8, error.message);
        } finally {
            deps.setButtonBusy('btn-ai-allocation', false);
        }
    }
    global.HanstockDashboardAiAllocationScreen = Object.freeze({ render: renderAiAllocation });
}(window));
