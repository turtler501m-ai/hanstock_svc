/* Holdings table rendering. Loaded before app.js. */
(function (global) {
    function renderHoldings(rows, config, deps) {
        const tbody = document.querySelector('#table-holdings tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!rows.length) {
            deps.setTableMessage('#table-holdings tbody', 10, deps.labels.empty);
            deps.updateHeaders();
            return;
        }
        rows.forEach((holding) => {
            const rtClass = Number(holding.rt || 0) >= 0 ? 'text-success' : 'text-danger';
            const pnlStatus = deps.pnlStatus(holding);
            const pnlLabel = pnlStatus === 'loss' ? deps.labels.loss : (pnlStatus === 'profit' ? deps.labels.profit : deps.labels.flat);
            const allocations = holding.strategy_allocations || [];
            const qty = Number(holding.qty || 0);
            const sellableQty = Number(holding.sellable_qty ?? holding.qty ?? 0);
            const sellPending = Boolean(holding.sell_pending);
            const weight = Number(holding.hanstock_weight || 0);
            const maxWeight = Number(config?.max_single_weight || 0);
            const exceeded = maxWeight > 0 && weight > maxWeight + 0.000001;
            const canSell = sellableQty > 0 && !sellPending;
            let qtyText = sellableQty !== qty ? `${qty.toLocaleString()} <small class="time-muted">${deps.labels.sellable} ${sellableQty.toLocaleString()}</small>` : qty.toLocaleString();
            if (sellPending) qtyText += ` <small class="time-muted">${deps.labels.pending}</small>`;
            const allocationHtml = allocations.length ? allocations.map((item) => `<span class="holding-strategy-chip">${deps.escapeHtml(item.strategy_name || item.strategy_id)}<small>${deps.formatNumber(item.allocated_qty || 0)}${deps.labels.items}</small><button type="button" class="button-ghost strategy-attribution-sell" data-symbol="${deps.escapeHtml(holding.symbol)}" data-name="${deps.escapeHtml(holding.name)}" data-strategy-id="${deps.escapeHtml(item.strategy_id)}" data-strategy-name="${deps.escapeHtml(item.strategy_name || item.strategy_id)}" data-qty="${Number(item.allocated_qty || 0)}" ${(Number(item.allocated_qty || 0) > 0 && sellableQty > 0 && !sellPending) ? '' : 'disabled'}>${deps.labels.sell}</button></span>`).join('') : `<span class="time-muted">${deps.labels.unattributed}</span>`;
            const row = document.createElement('tr');
            row.innerHTML = `<td><div class="symbol-name">${deps.escapeHtml(holding.name)}</div><div class="symbol-code">${deps.escapeHtml(holding.symbol)}</div></td><td>${qtyText}</td><td>${deps.formatCurrency(holding.price)}</td><td>${deps.formatCurrency(holding.value || qty * Number(holding.price || 0))}</td><td class="${exceeded ? 'text-danger' : ''}"><strong>${deps.formatNumber(weight * 100, 2)}%</strong>${exceeded ? `<small class="time-muted">${deps.labels.exceeded}</small>` : ''}</td><td class="${rtClass}">${deps.formatPercent(holding.rt)}</td><td class="${rtClass}">${deps.formatCurrency(holding.pnl)}</td><td><span class="holding-pnl-badge is-${pnlStatus}">${pnlLabel}</span></td><td><div class="holding-strategy-chips">${allocationHtml}</div></td><td><button type="button" class="button-ghost queue-order" data-symbol="${deps.escapeHtml(holding.symbol)}" data-name="${deps.escapeHtml(holding.name)}" data-action="sell" data-qty="${sellableQty}" data-price="0" data-reason="dashboard sell current holding" data-source="dashboard_holding_sell" ${canSell ? '' : 'disabled'}>${sellPending ? deps.labels.pending : deps.labels.sellAll}</button></td>`;
            tbody.appendChild(row);
        });
        tbody.querySelectorAll('.queue-order').forEach((button) => button.addEventListener('click', () => deps.createApproval(button), { once: true }));
        tbody.querySelectorAll('.strategy-attribution-sell').forEach((button) => button.addEventListener('click', () => deps.sellAttribution(button), { once: true }));
        deps.updateHeaders();
    }

    function flattenBrokerResponse(value, path, rows) {
        if (Array.isArray(value)) {
            if (!value.length) rows.push({ path, value: '[]' });
            value.forEach((item, index) => flattenBrokerResponse(item, `${path}[${index}]`, rows));
            return rows;
        }
        if (value && typeof value === 'object') {
            const entries = Object.entries(value);
            if (!entries.length) rows.push({ path, value: '{}' });
            entries.forEach(([key, item]) => flattenBrokerResponse(item, path ? `${path}.${key}` : key, rows));
            return rows;
        }
        rows.push({ path: path || '(root)', value });
        return rows;
    }

    const brokerFieldLabels = Object.freeze({
        rsp_cd: '응답 코드',
        rsp_msg: '응답 메시지',
        act_atv_tp_dtl_cd: '계좌 자산유형 상세코드',
        cfd_pdt_tp_nm: 'CFD 상품유형명',
        csh_wtm: '현금 관련 금액',
        dca: '예수금',
        drn_pbl_amt: '출금 가능 금액',
        ect_lga: '기타 대여금액',
        int_ny_pmt_amt: '미납 이자금액',
        lon_amt: '대출금액',
        mgg_rt: '담보비율',
        nas_amt: '순자산금액',
        nxt2_dd_dca: 'D+2 예수금',
        nxt_dd_dca: 'D+1 예수금',
        ny_rdp_amt: '상환 예정금액',
        orr_pbl_amt: '주문 가능 금액',
        orr_pbl_amt1: '주문 가능 금액 1',
        orr_pbl_amt2: '주문 가능 금액 2',
        orr_pbl_amt3: '주문 가능 금액 3',
        orr_pbl_amt4: '주문 가능 금액 4',
        rba: '미수 관련 금액',
        sba_amt: '대용금액',
        sba_wtm: '대용금 관련 금액',
        sll_edn_amt: '매도 정산금액',
        slo_mgg_amt: '대주 담보금액',
        tot_aet_amt: '총자산 금액',
        tot_byn_amt: '총 매수금액',
        tot_eal_amt: '총 평가금액',
        tot_eal_pls: '총 평가손익',
        iem_cd: '종목코드',
        iem_nm: '종목명',
        itg_bnc_qty: '통합 잔고수량',
        ny_stl_qty: '결제 반영 수량',
        rsdl_qty: '잔존 수량',
        phs_pr: '평균 매입단가',
        now_pr: '현재가',
        eal_amt: '평가금액',
        eal_pls_amt: '평가손익',
        pft_rt: '수익률',
    });
    const brokerFieldDescriptions = Object.freeze({
        rsp_cd: '나무 API 요청 처리 결과를 나타내는 코드입니다.',
        rsp_msg: '나무 API가 반환한 처리 결과 메시지입니다.',
        act_atv_tp_dtl_cd: '계좌에 적용된 자산유형의 상세 구분 코드입니다.',
        cfd_pdt_tp_nm: 'CFD 계좌인 경우 적용되는 상품유형 이름입니다.',
        csh_wtm: '나무 계좌 요약에서 제공하는 현금 관련 원본 금액입니다.',
        dca: '계좌에 보관된 예수금 총액입니다.',
        drn_pbl_amt: '현재 계좌에서 출금할 수 있는 금액입니다.',
        ect_lga: '기타 대여 거래와 관련된 금액입니다.',
        int_ny_pmt_amt: '아직 납부되지 않은 이자 관련 금액입니다.',
        lon_amt: '계좌에 반영된 대출금액입니다.',
        mgg_rt: '계좌의 담보비율입니다.',
        nas_amt: '부채 등을 반영한 순자산 관련 금액입니다.',
        nxt_dd_dca: '다음 영업일(D+1) 결제를 반영한 예상 예수금입니다.',
        nxt2_dd_dca: '두 번째 영업일(D+2) 결제를 반영한 예상 예수금입니다.',
        ny_rdp_amt: '결제일에 상환될 예정인 금액입니다.',
        orr_pbl_amt: '주문에 사용할 수 있는 금액입니다.',
        orr_pbl_amt1: '나무가 첫 번째 기준으로 계산한 주문 가능 금액입니다.',
        orr_pbl_amt2: '나무가 두 번째 기준으로 계산한 주문 가능 금액입니다.',
        orr_pbl_amt3: '나무가 세 번째 기준으로 계산한 주문 가능 금액입니다.',
        orr_pbl_amt4: '나무가 네 번째 기준으로 계산한 주문 가능 금액입니다.',
        pft_rt: '계좌 또는 보유종목의 평가 수익률입니다.',
        rba: '나무 계좌 요약에서 제공하는 미수 관련 원본 금액입니다.',
        sba_amt: '주문 증거금 등에 대신 사용할 수 있는 대용금액입니다.',
        sba_wtm: '나무 계좌 요약에서 제공하는 대용금 관련 원본 금액입니다.',
        sll_edn_amt: '매도 거래의 결제 또는 정산과 관련된 금액입니다.',
        slo_mgg_amt: '대주 거래에 설정된 담보 관련 금액입니다.',
        tot_aet_amt: '현금과 보유자산 등을 합산한 계좌 총자산입니다.',
        tot_byn_amt: '계좌 잔고에 반영된 총 매수금액입니다.',
        tot_eal_amt: '현재 가격으로 계산한 전체 보유자산 평가금액입니다.',
        tot_eal_pls: '전체 보유자산의 평가손익 합계입니다.',
        iem_cd: '보유종목을 식별하는 6자리 종목코드입니다.',
        iem_nm: '보유종목의 이름입니다.',
        itg_bnc_qty: '결제 상태를 통합해 표시한 현재 잔고수량입니다.',
        ny_stl_qty: '결제 예정분을 반영한 보유수량입니다.',
        rsdl_qty: '거래 이후 계좌에 남아 있는 수량입니다.',
        phs_pr: '보유종목 1주당 평균 매입가격입니다.',
        now_pr: '조회 시점의 현재 가격입니다.',
        eal_amt: '현재가와 보유수량을 기준으로 한 평가금액입니다.',
        eal_pls_amt: '평가금액과 매입금액의 차이입니다.',
    });
    const brokerNumericFields = new Set([
        'csh_wtm', 'dca', 'drn_pbl_amt', 'ect_lga', 'int_ny_pmt_amt', 'lon_amt',
        'mgg_rt', 'nas_amt', 'nxt_dd_dca', 'nxt2_dd_dca', 'ny_rdp_amt',
        'orr_pbl_amt', 'orr_pbl_amt1', 'orr_pbl_amt2', 'orr_pbl_amt3',
        'orr_pbl_amt4', 'pft_rt', 'rba', 'sba_amt', 'sba_wtm', 'sll_edn_amt',
        'slo_mgg_amt', 'tot_aet_amt', 'tot_byn_amt', 'tot_eal_amt', 'tot_eal_pls',
        'itg_bnc_qty', 'ny_stl_qty', 'rsdl_qty', 'phs_pr', 'now_pr', 'eal_amt',
        'eal_pls_amt',
    ]);

    function brokerFieldPresentation(item) {
        const holdingMatch = item.path.match(/^Output_1\[(\d+)]\.(.+)$/);
        const summaryMatch = item.path.match(/^Output_0\.(.+)$/);
        let group = '응답 정보';
        let field = item.path;
        if (holdingMatch) {
            group = `보유종목 ${Number(holdingMatch[1]) + 1}`;
            field = holdingMatch[2];
        } else if (summaryMatch) {
            group = '계좌 요약';
            field = summaryMatch[1];
        }
        const fieldName = field.split('.').pop();
        const label = brokerFieldLabels[fieldName] || fieldName;
        const description = brokerFieldDescriptions[fieldName]
            || '나무 API가 반환한 추가 원본 항목입니다. 정확한 의미는 증권사 필드 정의를 확인하세요.';
        let displayValue = item.value === null
            ? '값 없음'
            : (typeof item.value === 'string' ? item.value : JSON.stringify(item.value));
        if (brokerNumericFields.has(fieldName)
            && item.value !== '' && item.value !== null && Number.isFinite(Number(item.value))) {
            displayValue = Number(item.value).toLocaleString('ko-KR');
        }
        return { group, label, description, field: item.path, value: displayValue };
    }

    function renderBrokerResponse(response, deps) {
        const tbody = document.querySelector('#table-holding-broker-response tbody');
        const count = document.getElementById('holding-broker-response-count');
        if (!tbody) return;
        const rows = flattenBrokerResponse(response || {}, '', []);
        tbody.innerHTML = '';
        if (!rows.length) {
            deps.setTableMessage('#table-holding-broker-response tbody', 5, deps.labels.noRaw);
            if (count) count.textContent = '0개 필드';
            return;
        }
        rows.forEach((item) => {
            const presented = brokerFieldPresentation(item);
            const row = document.createElement('tr');
            row.innerHTML = `<td><span class="broker-response-group">${deps.escapeHtml(presented.group)}</span></td><td><strong>${deps.escapeHtml(presented.label)}</strong></td><td class="broker-response-value">${deps.escapeHtml(presented.value)}</td><td class="broker-response-description">${deps.escapeHtml(presented.description)}</td><td><code>${deps.escapeHtml(presented.field)}</code></td>`;
            tbody.appendChild(row);
        });
        if (count) count.textContent = `${rows.length.toLocaleString()}개 필드`;
    }

    global.HanstockDashboardHoldingsScreen = Object.freeze({
        render: renderHoldings,
        renderBrokerResponse,
    });
}(window));
