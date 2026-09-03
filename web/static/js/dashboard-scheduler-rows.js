(function (global) {
    'use strict';

    function cell(value, align) {
        const style = align === 'right'
            ? 'padding: 0.6rem 0.75rem; font-size: 0.85rem; text-align: right;'
            : 'padding: 0.6rem 0.75rem; font-size: 0.85rem;';
        return `<td style="${style}">${value}</td>`;
    }

    function appendPlanRows(tbody, rows, deps) {
        if (!tbody) return;
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 1.5rem; font-size: 0.9rem; color: var(--text-muted);">?앹꽦??怨꾪쉷???놁뒿?덈떎.</td></tr>';
            return;
        }
        rows.forEach((row) => {
            const decision = row.decision || (row.approval_id ? 'approved' : 'skip');
            const kind = decision === 'execute' || decision === 'approved' ? 'buy' : (decision === 'skip' ? 'hold' : 'warn');
            const reason = deps.schedulerReasonText(row);
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border)';
            tr.innerHTML = [
                cell(deps.escapeHtml(row.symbol || '-')),
                cell(`<div class="symbol-name" style="font-weight: 500;">${deps.escapeHtml(row.name || '-')}</div>`),
                cell(deps.pill(row.strategy_name || row.strategy_id || '湲곕낯 遺꾪븷留ㅻℓ', 'hold')),
                cell(deps.pill(deps.toKorPlanCategory(row.category), 'hold')),
                cell(deps.pill(deps.schedulerDecisionLabel(decision, row), kind)),
                cell(deps.escapeHtml(deps.schedulerPlanQuantityText(row)), 'right'),
                cell(deps.escapeHtml(deps.schedulerPlanPriceText(row)), 'right'),
                cell(`<div class="reason-cell" style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${deps.escapeHtml(reason)}">${deps.escapeHtml(reason)}</div>`),
            ].join('');
            tbody.appendChild(tr);
        });
    }

    function appendOrderRows(tbody, approved, approvalErrors, results, deps) {
        if (!tbody) return;
        if (!approved.length && !approvalErrors.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding: 1.5rem; font-size: 0.9rem; color: var(--text-muted);">?뱀씤 ?湲?二쇰Ц???녾굅???먮룞 ?뱀씤???앸왂?섏뿀?듬땲??</td></tr>';
            return;
        }
        const append = (row, isError) => {
            const orderId = isError ? row.approval_id : (row.id || row.approval_id);
            const matchingPlan = results.find((plan) => plan.approval_id && String(plan.approval_id) === String(orderId));
            const symbol = row.symbol || matchingPlan?.symbol || '-';
            const name = row.name || matchingPlan?.name || '-';
            const action = row.action || matchingPlan?.action || (isError ? '-' : 'buy');
            const quantity = row.qty ?? matchingPlan?.qty ?? matchingPlan?.signal_qty ?? '-';
            const price = row.price ?? matchingPlan?.price ?? matchingPlan?.signal_price ?? '-';
            const message = isError ? (row.message || '?ㅻ쪟 諛쒖깮') : (row.response_msg || row.message || '?뺤긽 泥섎━');
            const strategy = row.strategy_name || matchingPlan?.strategy_name || row.strategy_id || matchingPlan?.strategy_id || '湲곕낯 遺꾪븷留ㅻℓ';
            const status = isError ? deps.pill('?뱀씤?ㅻ쪟', 'sell') : (() => {
                const value = deps.schedulerApprovalStatus(row.status);
                return deps.pill(value.label, value.kind);
            })();
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border)';
            tr.innerHTML = [
                cell(deps.escapeHtml(orderId || '-')),
                cell(deps.escapeHtml(symbol)),
                cell(`<div class="symbol-name" style="font-weight: 500;">${deps.escapeHtml(name)}</div>`),
                cell(deps.pill(strategy, 'hold')),
                cell(action !== '-' ? deps.pill(deps.toKorAction(action), action === 'sell' ? 'sell' : 'buy') : '-'),
                cell(quantity !== '-' ? deps.formatNumber(quantity) : '-', 'right'),
                cell(price !== '-' ? `${deps.formatNumber(price)} ??` : '-', 'right'),
                cell(status),
                cell(`<div class="reason-cell${isError ? ' text-danger' : ''}" style="max-width: 420px; white-space: pre-wrap; overflow-wrap: anywhere;" title="${deps.escapeHtml(message)}">${deps.escapeHtml(message)}</div>`),
            ].join('');
            tbody.appendChild(tr);
        };
        approvalErrors.forEach((row) => append(row, true));
        approved.forEach((row) => append(row, false));
    }

    global.HanstockDashboardSchedulerRows = { appendPlanRows, appendOrderRows };
})(window);
