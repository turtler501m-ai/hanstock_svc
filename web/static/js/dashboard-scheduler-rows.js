(function (global) {
    'use strict';

    function cell(value, align) {
        return `<td class="scheduler-cell${align === 'right' ? ' is-right' : ''}">${value}</td>`;
    }

    function appendPlanRows(tbody, rows, deps) {
        if (!tbody) return;
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center scheduler-empty-message">생성된 매매 계획이 없습니다.</td></tr>';
            return;
        }
        rows.forEach((row) => {
            const decision = row.decision || (row.approval_id ? 'approved' : 'skip');
            const kind = decision === 'execute' || decision === 'approved' ? 'buy' : (decision === 'skip' ? 'hold' : 'warn');
            const reason = deps.schedulerReasonText(row);
            const tr = document.createElement('tr');
            tr.className = 'scheduler-data-row';
            tr.innerHTML = [
                cell(deps.escapeHtml(row.symbol || '-')),
                cell(`<div class="symbol-name scheduler-symbol-name">${deps.escapeHtml(row.name || '-')}</div>`),
                cell(deps.pill(row.strategy_name || row.strategy_id || '기본 분할매매', 'hold')),
                cell(deps.pill(deps.toKorPlanCategory(row.category), 'hold')),
                cell(deps.pill(deps.schedulerDecisionLabel(decision, row), kind)),
                cell(deps.escapeHtml(deps.schedulerPlanQuantityText(row)), 'right'),
                cell(deps.escapeHtml(deps.schedulerPlanPriceText(row)), 'right'),
                cell(`<div class="reason-cell scheduler-reason-cell is-single-line" title="${deps.escapeHtml(reason)}">${deps.escapeHtml(reason)}</div>`),
            ].join('');
            tbody.appendChild(tr);
        });
    }

    function appendOrderRows(tbody, approved, approvalErrors, results, deps) {
        if (!tbody) return;
        if (!approved.length && !approvalErrors.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center scheduler-empty-message">승인 대기 주문이 없거나 자동 승인이 취소되었습니다.</td></tr>';
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
            const message = isError ? (row.message || '오류 발생') : (row.response_msg || row.message || '정상 처리');
            const strategy = row.strategy_name || matchingPlan?.strategy_name || row.strategy_id || matchingPlan?.strategy_id || '기본 분할매매';
            const status = isError ? deps.pill('승인 오류', 'sell') : (() => {
                const value = deps.schedulerApprovalStatus(row.status);
                return deps.pill(value.label, value.kind);
            })();
            const tr = document.createElement('tr');
            tr.className = 'scheduler-data-row';
            tr.innerHTML = [
                cell(deps.escapeHtml(orderId || '-')),
                cell(deps.escapeHtml(symbol)),
                cell(`<div class="symbol-name scheduler-symbol-name">${deps.escapeHtml(name)}</div>`),
                cell(deps.pill(strategy, 'hold')),
                cell(action !== '-' ? deps.pill(deps.toKorAction(action), action === 'sell' ? 'sell' : 'buy') : '-'),
                cell(quantity !== '-' ? deps.formatNumber(quantity) : '-', 'right'),
                cell(price !== '-' ? `${deps.formatNumber(price)} 원` : '-', 'right'),
                cell(status),
                cell(`<div class="reason-cell scheduler-reason-cell is-multiline${isError ? ' text-danger' : ''}" title="${deps.escapeHtml(message)}">${deps.escapeHtml(message)}</div>`),
            ].join('');
            tbody.appendChild(tr);
        };
        approvalErrors.forEach((row) => append(row, true));
        approved.forEach((row) => append(row, false));
    }

    global.HanstockDashboardSchedulerRows = { appendPlanRows, appendOrderRows };
})(window);
