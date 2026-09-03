(function (global) {
    'use strict';

    function render(deps, item) {
        const { escapeHtml, formatCurrency, formatPercent, toKorAction, translateReason, setOpen } = deps;
        const panel = document.getElementById('performance-detail-panel');
        const title = document.getElementById('performanceDetailTitle');
        const subtitle = document.getElementById('performanceDetailSubtitle');
        const body = document.getElementById('performanceDetailBody');
        if (!panel || !title || !subtitle || !body) return;
        const details = Array.isArray(item.details) ? item.details : [];
        title.textContent = `${item.period || '-'} 성과 상세 목록`;
        subtitle.textContent = '선택한 성과 기간의 매수·매도 체결 기준 상세 내역입니다.';
        const pnl = Number(item.realized_pnl || 0);
        const pnlRate = Number(item.realized_pnl_rate || 0);
        const cls = (value) => Number(value) > 0 ? 'text-success' : (Number(value) < 0 ? 'text-danger' : '');
        const text = (value) => value == null ? '-' : `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(2)}%`;
        const holding = item.holding_change_pct == null ? null : Number(item.holding_change_pct);
        const kospi = item.kospi_change_pct == null ? null : Number(item.kospi_change_pct);
        const kosdaq = item.kosdaq_change_pct == null ? null : Number(item.kosdaq_change_pct);
        const summary = `<div class="performance-detail-summary">
            <div><span>거래 건수</span><strong>${Number(item.order_count || 0).toLocaleString()}건</strong></div>
            <div><span>매수/매도 금액</span><strong>${formatCurrency(item.buy_amount)} / ${formatCurrency(item.sell_amount)}</strong></div>
            <div><span>실현손익</span><strong class="${cls(pnl)}">${pnl > 0 ? '+' : ''}${formatCurrency(pnl)}</strong></div>
            <div><span>실현수익률</span><strong class="${cls(pnl)}">${pnlRate > 0 ? '+' : ''}${pnlRate.toFixed(2)}%</strong></div>
            <div><span>보유주식 변동</span><strong class="${cls(holding)}">${text(holding)}</strong></div>
            <div><span>KOSPI 대비</span><strong class="${cls(holding == null || kospi == null ? null : holding - kospi)}">${text(holding == null || kospi == null ? null : holding - kospi)}</strong></div>
            <div><span>KOSDAQ 대비</span><strong class="${cls(holding == null || kosdaq == null ? null : holding - kosdaq)}">${text(holding == null || kosdaq == null ? null : holding - kosdaq)}</strong></div>
        </div>`;
        if (!details.length) {
            body.innerHTML = `${summary}<p class="ai-modal-footnote">해당 기간의 체결 거래가 없습니다.</p>`;
            setOpen(true);
            panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }
        const columns = [['ts', '시간'], ['symbol', '종목'], ['name', '종목명'], ['action', '구분'], ['qty', '수량'], ['price', '단가'], ['amount', '금액'], ['realized_pnl', '실현손익'], ['realized_pnl_rate', '수익률'], ['strategy_name', '매매 전략'], ['reason', '사유']];
        const rows = (items) => items.map((detail) => {
            const value = Number(detail.realized_pnl || 0);
            return `<tr><td>${escapeHtml(detail.ts || '-')}</td><td>${escapeHtml(detail.symbol || '-')}</td><td>${escapeHtml(detail.name || '-')}</td><td>${escapeHtml(toKorAction(String(detail.action || '').toLowerCase()))}</td><td>${Number(detail.qty || 0).toLocaleString()}</td><td>${formatCurrency(detail.price)}</td><td>${formatCurrency(detail.amount)}</td><td class="${cls(value)}">${value > 0 ? '+' : ''}${formatCurrency(value)}</td><td class="${cls(value)}">${formatPercent(detail.realized_pnl_rate || 0)}</td><td>${escapeHtml(detail.strategy_name || detail.strategy_id || '전략 미등록')}</td><td>${escapeHtml(translateReason(detail.reason || '-'))}</td></tr>`;
        }).join('');
        body.innerHTML = `${summary}<div class="table-responsive performance-detail-table-wrap"><table class="performance-detail-table"><thead><tr>${columns.map(([key, label]) => `<th><button type="button" class="sortable-header" data-sort-key="${key}">${label}</button></th>`).join('')}</tr></thead><tbody>${rows(details)}</tbody></table></div>`;
        let sortKey = '';
        let direction = 1;
        body.querySelectorAll('.sortable-header').forEach((button) => button.addEventListener('click', () => {
            const next = button.dataset.sortKey;
            direction = sortKey === next ? direction * -1 : 1;
            sortKey = next;
            const numeric = ['qty', 'price', 'amount', 'realized_pnl', 'realized_pnl_rate'].includes(sortKey);
            const sorted = [...details].sort((left, right) => (numeric ? Number(left[sortKey] || 0) - Number(right[sortKey] || 0) : String(left[sortKey] || '').localeCompare(String(right[sortKey] || ''), 'ko')) * direction);
            const target = body.querySelector('.performance-detail-table tbody');
            if (target) target.innerHTML = rows(sorted);
        }));
        setOpen(true);
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    global.HanstockDashboardPerformanceDetail = { render };
})(window);
