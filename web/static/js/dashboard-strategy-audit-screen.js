/* Strategy audit screen orchestration. Loaded before app.js. */
(function (global) {
    async function renderStrategyAudit(strategyId, deps) {
        const id = strategyId || deps.getActiveId() || document.getElementById('select-ai-ranker')?.value || '';
        if (!id) return;
        deps.setActiveId(id);
        try {
            const [performance, events] = await Promise.all([
                deps.fetchJson(`/api/ai-strategies/${encodeURIComponent(id)}/performance?days=30`, 30000),
                deps.fetchJson(`/api/ai-strategies/${encodeURIComponent(id)}/events?limit=20`, 30000),
            ]);
            deps.setElementText('strategy-audit-title', `${id} 최근 운영 상태`);
            deps.setElementText('strategy-audit-candidates', deps.formatNumber(performance.candidate_count || 0));
            deps.setElementText('strategy-audit-score', `${performance.avg_final_score ?? '-'} / ${performance.avg_rule_score ?? '-'} / ${performance.avg_ml_score ?? '-'}`);
            deps.setElementText('strategy-audit-status', deps.summarizeCounts(performance.ai_model_status_counts));
            deps.setElementText('strategy-audit-optimizer', deps.summarizeCounts(performance.optimizer_counts));
            const trades = performance.trade_summary || {};
            deps.setElementText('strategy-audit-review', `${performance.avg_return_5d ?? '-'}% / ${performance.win_rate_5d ?? '-'}%`);
            deps.setElementText('strategy-audit-warning', `5d return/win, fill ${trades.fill_rate ?? '-'}% (${trades.filled_count || 0}/${trades.order_count || 0})`);

            const strategy = (deps.getStrategyCatalog() || []).find((item) => item.id === id);
            let backtestData = null;
            if (strategy?.last_validation_result) {
                try {
                    const result = typeof strategy.last_validation_result === 'string'
                        ? JSON.parse(strategy.last_validation_result)
                        : strategy.last_validation_result;
                    backtestData = result.checks?.backtest;
                } catch (error) {
                    console.warn('Failed to parse last_validation_result:', error);
                }
            }
            renderBacktestChart(backtestData);
            renderEvents(events.events || [], deps);
        } catch (error) {
            deps.setStatus(`전략 감사 조회 실패: ${error.message}`);
        }
    }

    function renderBacktestChart(backtestData) {
        const container = document.getElementById('strategy-backtest-chart-container');
        if (!container) return;
        if (!backtestData?.equity_curve?.length) {
            container.style.display = 'none';
            return;
        }
        container.style.display = 'block';
        const canvas = document.getElementById('chart-strategy-backtest');
        if (!canvas || typeof global.Chart !== 'function') return;
        if (global.strategyBacktestChart) global.strategyBacktestChart.destroy();
        global.strategyBacktestChart = new global.Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: backtestData.dates || backtestData.equity_curve.map((_, index) => `Day ${index}`),
                datasets: [{
                    label: '누적 자산 가치', data: backtestData.equity_curve,
                    borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2, fill: true, tension: 0.1, pointRadius: 0,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }, tooltip: {
                        mode: 'index', intersect: false,
                        callbacks: { label: (context) => `자산: ${Number(context.raw).toLocaleString()}원` },
                    },
                },
                scales: {
                    x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 8 } },
                    y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: { size: 9 } } },
                },
            },
        });
    }

    function renderEvents(rows, deps) {
        const tbody = document.querySelector('#table-strategy-events tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!rows.length) {
            deps.setTableMessage('#table-strategy-events tbody', 4, '전략 이벤트가 없습니다.');
            return;
        }
        rows.forEach((event) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${deps.escapeHtml(event.ts || '-')}</td><td>${deps.escapeHtml(event.event_type || '-')}</td><td>${deps.escapeHtml(event.strategy_version || '-')}</td><td>${deps.escapeHtml(deps.eventPayloadSummary(event.payload))}</td>`;
            tbody.appendChild(tr);
        });
    }

    global.HanstockDashboardStrategyAuditScreen = Object.freeze({ render: renderStrategyAudit });
}(window));
