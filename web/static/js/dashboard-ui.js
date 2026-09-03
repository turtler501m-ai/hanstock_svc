/* Shared DOM helpers for dashboard feature modules. */
(function (global) {
    const ui = {
        setTableMessage(selector, colspan, message) {
            const tbody = document.querySelector(selector);
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="${colspan}" class="empty-state">${global.HanstockDashboardFormatters.escapeHtml(message)}</td></tr>`;
            }
        },

        setStatus(message, ok = false) {
            const banner = document.getElementById('status-banner');
            if (banner) {
                banner.hidden = false;
                banner.className = `status-banner ${ok ? 'ok' : ''}`;
                banner.textContent = message;
            }
        },

        setButtonBusy(id, busy) {
            const button = typeof id === 'string' ? document.getElementById(id) : id;
            if (button) button.disabled = busy;
        },

        setElementText(id, value) {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
            return element;
        },

        pill(value, kind = 'hold') {
            return `<span class="pill pill-${kind}">${global.HanstockDashboardFormatters.escapeHtml(value)}</span>`;
        },
    };

    global.HanstockDashboardUi = Object.freeze(ui);
}(window));
