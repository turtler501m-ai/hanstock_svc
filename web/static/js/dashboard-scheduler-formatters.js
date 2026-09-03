(function (global) {
    'use strict';

    function approvalStatus(status) {
        const normalized = String(status || '').toLowerCase();
        const labels = {
            executed: { label: '주문 접수', kind: 'buy' }, rejected: { label: '거절', kind: 'warn' },
            failed: { label: '실패', kind: 'sell' }, broker_unknown: { label: '브로커 확인 필요', kind: 'warn' },
            expired: { label: '만료', kind: 'hold' }, pending: { label: '승인 대기', kind: 'hold' },
        };
        return labels[normalized] || { label: status || '상태 미확인', kind: 'hold' };
    }

    function planQuantity(deps, row) {
        const quantity = Number(row.qty ?? row.signal_qty ?? 0);
        if (quantity > 0) return deps.formatNumber(quantity);
        const holding = Number(row.holding_qty ?? 0);
        if (row.action === 'hold' && holding > 0) return `보유 ${deps.formatNumber(holding)} 주`;
        if (row.action === 'hold') return '보유 없음';
        return '수량 미산출';
    }

    function planPrice(deps, row) {
        const price = Number(row.price ?? row.signal_price ?? 0);
        if (price > 0) return `${deps.formatNumber(price)} 원`;
        if (row.action === 'sell' && Number(row.qty ?? row.signal_qty ?? 0) > 0) return '시장가';
        const current = Number(row.current_price ?? 0);
        if (row.action === 'hold' && current > 0) return `현재가 ${deps.formatNumber(current)} 원`;
        if (row.action === 'hold') return '현재가 확인 불가';
        return '가격 미산출';
    }

    function kstTime(value) {
        if (!value) return '-';
        try {
            return new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
        } catch (_error) {
            return value;
        }
    }

    global.HanstockDashboardSchedulerFormatters = { approvalStatus, planQuantity, planPrice, kstTime };
})(window);
