/* Approval queue API loading boundary. Loaded before app.js. */
(function (global) {
    async function load(fetchJson) {
        const [data, orderHealth] = await Promise.all([
            fetchJson('/api/approvals?limit=50'),
            fetchJson('/api/operations/order-health'),
        ]);
        return { data, orderHealth };
    }
    global.HanstockDashboardApprovalQueue = Object.freeze({ load });
}(window));
