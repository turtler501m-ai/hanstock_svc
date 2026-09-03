(function (global) {
    'use strict';

    function render(tbody, strategies, selectedId, draftSelection, deps) {
        strategies.forEach((strategy) => {
            const profile = strategy.profile || {};
            const risk = profile.risk || {};
            const selectable = deps.isSharedScheduleSelectable(strategy);
            const checked = draftSelection.has(strategy.id);
            const pendingChange = checked !== Boolean(strategy.selected);
            const builtIn = ['gpt_5_mini_default', 'rule_only_default'].includes(strategy.id);
            let scheduleLabel = strategy.independent_schedule
                ? (strategy.selected ? 'Independent schedule on' : 'Independent schedule off')
                : (strategy.selected ? 'Applied' : 'Not applied');
            let scheduleKind = strategy.selected ? 'buy' : 'hold';
            if (pendingChange) {
                scheduleLabel = checked ? 'Apply pending' : 'Disable pending';
                scheduleKind = 'hold';
            }
            const tr = document.createElement('tr');
            tr.dataset.id = strategy.id;
            tr.classList.toggle('is-selected', strategy.id === selectedId);
            tr.classList.toggle('has-pending-selection', pendingChange);
            tr.innerHTML = `
                <td class="strategy-check-column">
                    <input type="checkbox" class="strategy-select-checkbox" data-id="${deps.escapeHtml(strategy.id)}"
                        ${checked ? 'checked' : ''} ${selectable ? '' : 'disabled'}
                        title="${selectable ? '怨듭슜 ?ㅼ?以??곸슜 ????좏깮' : '?뱀씤 ?꾨즺 ?꾨왂留??ъ슜?????덉뒿?덈떎.'}">
                </td>
                <td><div class="symbol-name">${deps.escapeHtml(deps.strategyDisplayName(strategy))}</div>
                    <div class="symbol-code">${deps.escapeHtml(strategy.id)} 쨌 v${deps.escapeHtml(strategy.strategy_version || 1)}</div></td>
                <td><span class="strategy-category-badge is-${deps.escapeHtml(deps.strategyScheduleCategory(strategy))}">${deps.escapeHtml(deps.strategyScheduleCategoryLabel(strategy))}</span></td>
                <td>${deps.pill(scheduleLabel, scheduleKind)} ${pendingChange ? '<small class="strategy-pending-note">?곸슜 踰꾪듉 ?꾩슂</small>' : ''}</td>
                <td><div class="strategy-core-criteria"><span>AI ${deps.formatNumber(Number(profile.ai_weight ?? strategy.weight ?? 0) * 100, 0)}%</span>
                    <span>醫낅ぉ ?꾪뿕 ${deps.formatNumber(risk.max_risk_per_trade_pct ?? 0.5, 1)}%</span></div>
                    <small class="time-muted">${deps.escapeHtml(strategy.status_label || deps.strategyStatusLabel(strategy.status))}</small></td>
                <td class="strategy-manage-column"><div class="button-row strategy-row-actions">
                    <button type="button" class="button-ghost compact-button btn-open-strategy-detail" data-id="${deps.escapeHtml(strategy.id)}">?곸꽭</button>
                    ${builtIn ? '<span class="strategy-built-in-label">湲곕낯 ?꾨왂</span>' : `<button type="button" class="button-danger compact-button btn-delete-strategy" data-id="${deps.escapeHtml(strategy.id)}">??젣</button>`}
                </div></td>`;
            tr.addEventListener('click', (event) => {
                if (event.target.closest('input, button')) return;
                deps.select(strategy, tr);
            });
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.strategy-select-checkbox').forEach((input) => {
            input.addEventListener('change', () => deps.changeSelection(input));
        });
        tbody.querySelectorAll('.btn-open-strategy-detail').forEach((button) => {
            button.addEventListener('click', () => {
                const strategy = strategies.find((item) => item.id === button.dataset.id);
                if (strategy) deps.openDetail(strategy);
            });
        });
        tbody.querySelectorAll('.btn-delete-strategy').forEach((button) => {
            button.addEventListener('click', () => {
                const strategy = strategies.find((item) => item.id === button.dataset.id);
                if (strategy) deps.deleteStrategy(strategy, button);
            });
        });
    }

    global.HanstockDashboardAiStrategyTable = { render };
})(window);
