/**
 * Integration tests using Node.js built-in test runner (node --test).
 *
 * Prerequisites:
 *   - MongoDB running as a replica set on MONGODB_URI (or the default
 *     mongodb://127.0.0.1:27017). Change streams require a replica set.
 *   - The test starts the Express/Socket.IO server on a random free port so it
 *     does not conflict with a running dev server.
 *
 * Run:
 *   npm test
 */

'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { ioc: ioClient } = require('socket.io-client');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find a random free TCP port by letting the OS assign one.
 * @returns {Promise<number>}
 */
function getFreePort() {
    return new Promise((resolve, reject) => {
        const srv = http.createServer();
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            srv.close((err) => (err ? reject(err) : resolve(port)));
        });
    });
}

/**
 * POST JSON to a URL and return { status, body }.
 */
function postJson(url, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const urlObj = new URL(url);

        const req = http.request(
            {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(data) });
                    } catch {
                        resolve({ status: res.statusCode, body: data });
                    }
                });
            }
        );

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// ---------------------------------------------------------------------------
// Test lifecycle — spin up the server before tests, tear it down after.
// ---------------------------------------------------------------------------

// We need to import the server but prevent it from calling start() immediately.
// The simplest approach: set the environment vars and require the server module
// after we have patched process.env.PORT to the free port.

/** @type {import('node:http').Server} */
let serverInstance;
/** @type {string} */
let baseUrl;

before(async () => {
    const port = await getFreePort();
    process.env.PORT = String(port);
    process.env.API_TOKEN = ''; // auth disabled during tests

    // Dynamically require *after* setting env vars so dotenv picks them up.
    // We wrap in a try/catch: if MongoDB is unavailable the tests will still
    // start but individual assertions will fail (no false-green on import errors).
    const app = require('../server');
    baseUrl = `http://127.0.0.1:${port}`;

    // server.js calls server.listen internally; wait a moment for it to bind.
    await new Promise((r) => setTimeout(r, 600));
});

after(() => {
    // Close the HTTP server if it was exposed (server.js does not export it, so
    // we skip explicit close — the process exits after node --test finishes).
});

// ---------------------------------------------------------------------------
// Test 1: POST /orders → 201 + correct shape
// ---------------------------------------------------------------------------
test('POST /orders returns 201 with the correct document shape', async () => {
    const { status, body } = await postJson(`${baseUrl}/orders`, {
        customer_name: 'Test Customer',
        product_name: 'Widget Pro',
        status: 'pending'
    });

    assert.equal(status, 201, `Expected 201 but got ${status}`);

    // Shape assertions
    assert.ok(body._id, 'Response must include _id');
    assert.equal(typeof body._id, 'string', '_id must be a string');
    assert.equal(body.customer_name, 'Test Customer');
    assert.equal(body.product_name, 'Widget Pro');
    assert.equal(body.status, 'pending');
    assert.ok(body.created_at, 'Response must include created_at');
    assert.ok(body.updated_at, 'Response must include updated_at');
});

// ---------------------------------------------------------------------------
// Test 2: POST /orders triggers an order_update Socket.IO event with INSERT
// ---------------------------------------------------------------------------
test('Creating an order triggers an order_update socket event with operation INSERT', async () => {
    /** @type {import('socket.io-client').Socket} */
    const clientSocket = ioClient(baseUrl, {
        auth: { token: '' },
        transports: ['websocket'],
        reconnection: false
    });

    // Wait for connection
    await new Promise((resolve, reject) => {
        clientSocket.once('connect', resolve);
        clientSocket.once('connect_error', reject);
        setTimeout(() => reject(new Error('Socket connect timeout')), 5000);
    });

    // Set up a promise that resolves on the next order_update event
    const updatePromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout: no order_update event received')), 6000);

        clientSocket.once('order_update', (payload) => {
            clearTimeout(timer);
            resolve(payload);
        });
    });

    // POST a new order to trigger the change stream
    const { status } = await postJson(`${baseUrl}/orders`, {
        customer_name: 'Socket Test',
        product_name: 'Realtime Widget',
        status: 'pending'
    });

    assert.equal(status, 201);

    const payload = await updatePromise;

    // Verify event shape
    assert.equal(payload.operation, 'INSERT', `Expected INSERT but got ${payload.operation}`);
    assert.ok(payload.data, 'Event payload must have a data field');
    assert.equal(payload.data.customer_name, 'Socket Test');

    clientSocket.disconnect();
});
