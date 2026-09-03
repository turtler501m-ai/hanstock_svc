(function (global) {
    'use strict';

    async function render(deps) {
        const {
            setButtonBusy, setTableMessage, fetchJson, escapeHtml, formatNumber,
            pill, toKorAction, bindQueueButtons,
        } = deps;
        setButtonBusy('btn-optimizer', true);
        setTableMessage('#table-optimizer tbody', 7, '\ud3ec\ud2b8\ud3f4\ub9ac \ucd5c\uc801 \ube44\uc911\uc744 \uacc4\uc0b0\ud558\uace0 \uc788\uc2b5\ub2c8\ub2e4...');
        try {
            const data = await fetchJson('/api/portfolio-optimizer');
            const tbody = document.querySelector('#table-optimizer tbody');
            if (!tbody) return;
            tbody.innerHTML = '';
            if (!data.positions.length) {
                setTableMessage('#table-optimizer tbody', 7, '\uacc4\uc0b0\ud560 \ubcf4\uc720 \uc885\ubaa9\uc774 \uc5c6\uc2b5\ub2c8\ub2e4');
                return;
            }
            data.positions.forEach((row) => {
                const action = String(row.rebalance_action || 'hold').toLowerCase();
                const kind = action === 'buy' ? 'buy' : (action === 'sell' ? 'sell' : 'hold');
                const reason = `\ud3ec\ud2b8\ud3f4\ub9ac \ubaa9\ud45c\ube44\uc911 ${formatNumber(row.target_weight * 100, 1)}%; \uc810\uc218=${formatNumber(row.score, 1)}, \ubcc0\ub3d9\uc131=${formatNumber(row.volatility * 100, 1)}%`;
                const queueButton = action === 'hold'
                    ? '<button type="button" class="button-ghost" disabled style="opacity:0.3; cursor:not-allowed;">\ubcc0\uacbd\uc5c6\uc74c</button>'
                    : `<button type="button" class="button-ghost queue-order"
                    data-symbol="${escapeHtml(row.symbol)}"
                    data-name="${escapeHtml(row.name)}"
                    data-action="${escapeHtml(action)}"
                    data-qty="${Number(row.rebalance_qty || 0)}"
                    data-price="${Number(row.price || 0)}"
                    data-reason="${escapeHtml(reason)}"
                    data-source="portfolio-optimizer">\uc2b9\uc778\ub300\uae30</button>`;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                <td><div class="symbol-name">${escapeHtml(row.name)}</div><div class="symbol-code">${escapeHtml(row.symbol)}</div></td>
                <td>${pill(formatNumber(row.score, 1), Number(row.score || 0) >= 3 ? 'buy' : 'hold')}</td>
                <td>${formatNumber(row.volatility * 100, 1)}%</td>
                <td>${formatNumber(row.current_weight * 100, 1)}%</td>
                <td>${formatNumber(row.target_weight * 100, 1)}%</td>
                <td>${pill(toKorAction(action), kind)}</td>
                <td>${queueButton}</td>`;
                tbody.appendChild(tr);
            });
            bindQueueButtons();
            const hasOrders = data.positions.some((row) => String(row.rebalance_action || 'hold').toLowerCase() !== 'hold');
            const batchBtn = document.getElementById('btn-optimizer-batch');
            if (batchBtn) batchBtn.hidden = !hasOrders;
        } catch (err) {
            setTableMessage('#table-optimizer tbody', 7, err.message);
            const batchBtn = document.getElementById('btn-optimizer-batch');
            if (batchBtn) batchBtn.hidden = true;
        } finally {
            setButtonBusy('btn-optimizer', false);
        }
    }

    global.HanstockDashboardOptimizerScreen = { render };
})(window);
