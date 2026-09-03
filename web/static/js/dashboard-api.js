/* Shared dashboard HTTP client. Loaded before app.js. */
(function (global) {
    const api = {};

    api.fetchJson = async function (url, timeoutMs = 60000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const requestUrl = new URL(url, global.location.origin);
            requestUrl.searchParams.set('_ts', Date.now().toString());
            const response = await fetch(requestUrl.toString(), {
                signal: controller.signal,
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || `Request failed: ${response.status}`);
            }
            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error(`Request timed out: ${url}`);
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    };

    api.postJson = async function (url, payload = {}) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || `Request failed: ${response.status}`);
        }
        return data;
    };

    api.deleteJson = async function (url) {
        const response = await fetch(url, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || `Request failed: ${response.status}`);
        }
        return data;
    };

    global.HanstockDashboardApi = Object.freeze(api);
}(window));
