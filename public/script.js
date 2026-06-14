// ---------------------------------------------------------------------------
// Socket.IO client setup
// API_TOKEN is injected server-side into the page or falls back to empty
// (when auth is disabled the server accepts empty tokens too).
// ---------------------------------------------------------------------------
const API_TOKEN = window.__API_TOKEN__ || '';

const socket = io({
    auth: {
        token: API_TOKEN,
        // To join a customer-scoped room, set window.__SOCKET_ROOM__ before this
        // script loads, e.g.:  <script>window.__SOCKET_ROOM__ = 'customer:42';</script>
        room: window.__SOCKET_ROOM__ || undefined
    }
});

const state = {
    orders: [],
    events: [],
    filter: ''
};

const ordersBody = document.getElementById('ordersBody');
const ordersEmpty = document.getElementById('ordersEmpty');
const eventFeed = document.getElementById('eventFeed');
const searchInput = document.getElementById('searchInput');
const clearFeed = document.getElementById('clearFeed');
const totalOrders = document.getElementById('totalOrders');
const activeOrders = document.getElementById('activeOrders');
const latestEvent = document.getElementById('latestEvent');
const connectionDot = document.getElementById('connectionDot');
const connectionText = document.getElementById('connectionText');

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function orderId(order) {
    return String(order?._id || order?.id || '');
}

function shortId(order) {
    const id = orderId(order);
    return id ? id.slice(-6).toUpperCase() : '-';
}

function formatTime() {
    return new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

const TRACKED_FIELDS = [
    { key: 'customer_name', label: 'Customer' },
    { key: 'product_name', label: 'Product' },
    { key: 'status', label: 'Status' }
];

function buildEventDetails(operation, previous, next) {
    const op = String(operation || 'UPDATE').toUpperCase();
    const record = next || previous || {};

    if (op === 'INSERT') {
        return [
            `Customer: ${record.customer_name || '-'}`,
            `Product: ${record.product_name || '-'}`,
            `Status: ${record.status || '-'}`
        ];
    }

    if (op === 'DELETE') {
        const removed = previous || record;
        return [
            `Customer: ${removed.customer_name || '-'}`,
            `Product: ${removed.product_name || '-'}`,
            `Status: ${removed.status || '-'}`
        ];
    }

    const changes = [];

    for (const { key, label } of TRACKED_FIELDS) {
        const before = previous?.[key];
        const after = record[key];

        if (before === undefined && after === undefined) {
            continue;
        }

        if (String(before ?? '') !== String(after ?? '')) {
            if (before !== undefined && after !== undefined) {
                changes.push(`${label}: ${before} → ${after}`);
            } else if (after !== undefined) {
                changes.push(`${label}: ${after}`);
            } else if (before !== undefined) {
                changes.push(`${label}: ${before} → (removed)`);
            }
        }
    }

    if (changes.length > 0) {
        return changes;
    }

    return [
        `Status: ${record.status || '-'}`,
        `ID: ${shortId(record)}`
    ];
}

function buildEventSummary(operation, previous, next) {
    const op = String(operation || 'UPDATE').toUpperCase();
    const record = next || previous || {};
    const name = record.customer_name || 'Order';

    if (op === 'INSERT') {
        return `New order · ${name}`;
    }

    if (op === 'DELETE') {
        return `Removed · ${name}`;
    }

    const details = buildEventDetails('UPDATE', previous, next);
    return details.length ? `${name} · ${details[0]}` : `Updated · ${name}`;
}

function eventTitle(operation) {
    const op = String(operation || 'UPDATE').toUpperCase();

    if (op === 'INSERT') {
        return 'New order';
    }

    if (op === 'DELETE') {
        return 'Order removed';
    }

    return 'Order updated';
}

// ---------------------------------------------------------------------------
// Connection status indicator (Section 3)
// 'Live' | 'Reconnecting…' | 'Offline'
// ---------------------------------------------------------------------------
function setConnection(status) {
    connectionText.textContent = status;
    connectionDot.classList.toggle('online', status === 'Live');
    connectionDot.classList.toggle('reconnecting', status === 'Reconnecting…');
    connectionDot.classList.toggle('offline', status === 'Offline');
}

function renderMetrics() {
    const active = new Set(['pending', 'processing', 'packed', 'shipped', 'in progress']);
    const activeCount = state.orders.filter((order) => {
        return active.has(String(order.status || '').toLowerCase());
    }).length;

    totalOrders.textContent = state.orders.length;
    activeOrders.textContent = activeCount;
    latestEvent.textContent = state.events[0]?.summary || state.events[0]?.operation || 'None';
}

function renderOrders() {
    const query = state.filter.trim().toLowerCase();
    const filtered = state.orders.filter((order) => {
        return [
            orderId(order),
            order.customer_name,
            order.product_name,
            order.status
        ].join(' ').toLowerCase().includes(query);
    });

    ordersBody.innerHTML = filtered.map((order) => `
        <tr>
            <td>${escapeHtml(shortId(order))}</td>
            <td>${escapeHtml(order.customer_name || '-')}</td>
            <td>${escapeHtml(order.product_name || '-')}</td>
            <td><span class="status-pill">${escapeHtml(order.status || '-')}</span></td>
        </tr>
    `).join('');

    ordersEmpty.parentElement.classList.toggle('is-empty', filtered.length === 0);
    renderMetrics();
}

function renderEvents() {
    if (state.events.length === 0) {
        eventFeed.innerHTML = '<p class="empty">Waiting for changes.</p>';
        renderMetrics();
        return;
    }

    eventFeed.innerHTML = state.events.map((event) => {
        const op = String(event.operation || 'UPDATE').toLowerCase();
        const details = (event.details || []).map((line) => (
            `<li>${escapeHtml(line)}</li>`
        )).join('');

        return `
        <article class="event-card event-${op}">
            <div class="event-meta">
                <span class="event-op">${escapeHtml(event.operation)}</span>
                <span>${escapeHtml(event.time)}</span>
            </div>
            <strong>${escapeHtml(eventTitle(event.operation))} · ${escapeHtml(shortId(event.order))}</strong>
            <p>${escapeHtml(event.order.customer_name || 'Unknown')} · ${escapeHtml(event.order.product_name || 'No product')}</p>
            <ul class="event-details">${details}</ul>
        </article>
    `;
    }).join('');

    renderMetrics();
}

function upsertOrder(order) {
    const id = orderId(order);

    if (!id) {
        return;
    }

    const index = state.orders.findIndex((item) => orderId(item) === id);

    if (index >= 0) {
        state.orders[index] = {
            ...state.orders[index],
            ...order
        };
    } else {
        state.orders.unshift(order);
    }
}

function removeOrder(order) {
    const id = orderId(order);
    state.orders = state.orders.filter((item) => orderId(item) !== id);
}

function applyRealtimeUpdate(payload) {
    const operation = String(payload?.operation || 'UPDATE').toUpperCase();
    const order = payload?.data || {};
    const id = orderId(order);
    const previous = id
        ? state.orders.find((item) => orderId(item) === id)
        : null;
    const previousSnapshot = previous ? { ...previous } : null;

    if (operation === 'DELETE') {
        removeOrder(order);
    } else {
        upsertOrder(order);
    }

    const displayOrder = operation === 'DELETE'
        ? (previousSnapshot || order)
        : (state.orders.find((item) => orderId(item) === id) || order);

    state.events.unshift({
        operation,
        order: displayOrder,
        details: buildEventDetails(operation, previousSnapshot, order),
        summary: buildEventSummary(operation, previousSnapshot, order),
        time: formatTime()
    });
    state.events = state.events.slice(0, 10);

    renderOrders();
    renderEvents();
}

// ---------------------------------------------------------------------------
// Data loading (Section 3 + Section 4)
// Handles the new paginated response shape: { data: [...], nextCursor }
// ---------------------------------------------------------------------------
async function loadOrders() {
    try {
        const headers = {};

        if (API_TOKEN) {
            headers['Authorization'] = `Bearer ${API_TOKEN}`;
        }

        const response = await fetch('/orders', { headers });

        if (!response.ok) {
            throw new Error(`Request failed with ${response.status}`);
        }

        const json = await response.json();

        // Support both the new paginated shape and a plain array (backwards compat).
        state.orders = Array.isArray(json) ? json : (json.data || []);
        renderOrders();
    } catch (error) {
        ordersEmpty.textContent = 'Unable to load orders. Check MongoDB and restart the server.';
        ordersEmpty.parentElement.classList.add('is-empty');
        console.warn('Orders are unavailable:', error);
    }
}

// ---------------------------------------------------------------------------
// Socket event handlers (Section 3)
// On reconnect, re-fetch the full order list to catch up on missed events.
// ---------------------------------------------------------------------------
socket.on('connect', () => {
    setConnection('Live');
    // Re-fetch full table on every (re)connect to catch missed updates.
    loadOrders();
});

socket.on('disconnect', () => {
    setConnection('Reconnecting…');
});

socket.on('connect_error', () => {
    setConnection('Offline');
});

socket.on('order_update', applyRealtimeUpdate);

searchInput.addEventListener('input', (event) => {
    state.filter = event.target.value;
    renderOrders();
});

clearFeed.addEventListener('click', () => {
    state.events = [];
    renderEvents();
});

setConnection('Connecting');
loadOrders();
