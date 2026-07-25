require('dotenv').config({ quiet: true });

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const { Kafka } = require('kafkajs');
const {
    connectToDatabase,
    getOrders,
    createOrder,
    updateOrder,
    deleteOrder
} = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*'
    }
});

const PORT = process.env.PORT || 5000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Bearer-token auth middleware (Section 5)
// ---------------------------------------------------------------------------
// API_TOKEN must be set in .env. All REST routes below are protected.
// The browser client sends: Authorization: Bearer <token>
function requireBearerToken(req, res, next) {
    const apiToken = process.env.API_TOKEN;

    if (!apiToken) {
        // No token configured — skip auth so the server still works without a key set.
        return next();
    }

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token || token !== apiToken) {
        return res.status(401).json({ error: 'Unauthorized: invalid or missing bearer token' });
    }

    next();
}

// ---------------------------------------------------------------------------
// Socket.IO middleware — same token check (Section 5)
// ---------------------------------------------------------------------------
io.use((socket, next) => {
    const apiToken = process.env.API_TOKEN;

    if (!apiToken) {
        return next(); // auth disabled — no token configured
    }

    const token = socket.handshake.auth?.token;

    if (!token || token !== apiToken) {
        return next(new Error('Unauthorized: invalid or missing socket token'));
    }

    next();
});

// ---------------------------------------------------------------------------
// REST routes (Section 2 + Section 4 + Section 5)
// ---------------------------------------------------------------------------

/**
 * GET /orders
 * Supports cursor-based pagination:
 *   ?limit=50          – page size (default 50, max 200)
 *   ?cursor=<id>       – last seen id from previous page (integer)
 *
 * The Kafka consumer is the sole emitter of order_update events (Section 2).
 * These routes only read/write PostgreSQL.
 */
app.get('/orders', requireBearerToken, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const cursor = req.query.cursor || null;

        const result = await getOrders(limit, cursor);

        res.json(result);
    } catch (err) {
        console.error('Failed to fetch orders:', err.message);
        res.status(500).json({
            error: 'Failed to fetch orders'
        });
    }
});

app.post('/orders', requireBearerToken, async (req, res) => {
    try {
        const customer_name = String(req.body.customer_name || '').trim();
        const product_name  = String(req.body.product_name  || '').trim();
        const status        = String(req.body.status        || 'pending').trim();

        if (!customer_name || !product_name) {
            return res.status(400).json({
                error: 'customer_name and product_name are required'
            });
        }

        const order = await createOrder({ customer_name, product_name, status });

        // The Kafka consumer is the sole emitter of order_update events (Section 2).
        // No io.emit() here.

        return res.status(201).json(order);
    } catch (err) {
        console.error('Failed to create order:', err.message);
        return res.status(500).json({
            error: 'Failed to create order'
        });
    }
});

app.patch('/orders/:id', requireBearerToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        if (!id || isNaN(id)) {
            return res.status(400).json({
                error: 'Invalid order id'
            });
        }

        const fields = {};

        for (const field of ['customer_name', 'product_name', 'status']) {
            if (req.body[field] !== undefined) {
                fields[field] = String(req.body[field]).trim();
            }
        }

        const order = await updateOrder(id, fields);

        if (!order) {
            return res.status(404).json({
                error: 'Order not found'
            });
        }

        // The Kafka consumer is the sole emitter of order_update events (Section 2).
        // No io.emit() here.

        return res.json(order);
    } catch (err) {
        console.error('Failed to update order:', err.message);
        return res.status(500).json({
            error: 'Failed to update order'
        });
    }
});

app.delete('/orders/:id', requireBearerToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        if (!id || isNaN(id)) {
            return res.status(400).json({
                error: 'Invalid order id'
            });
        }

        const order = await deleteOrder(id);

        if (!order) {
            return res.status(404).json({
                error: 'Order not found'
            });
        }

        // The Kafka consumer is the sole emitter of order_update events (Section 2).
        // No io.emit() here.

        return res.json(order);
    } catch (err) {
        console.error('Failed to delete order:', err.message);
        return res.status(500).json({
            error: 'Failed to delete order'
        });
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        database: 'postgresql',
        service: 'order-monitor'
    });
});

// ---------------------------------------------------------------------------
// Socket.IO connection + room handling (Section 4)
// ---------------------------------------------------------------------------
// Clients may join a named room by passing `room` in the auth handshake, e.g.:
//   io({ auth: { token: '...', room: 'customer:42' } })
// If no room is given, the socket is placed in the global "all_orders" room.
// ---------------------------------------------------------------------------
const GLOBAL_ROOM = 'all_orders';

io.on('connection', (socket) => {
    const room = socket.handshake.auth?.room || GLOBAL_ROOM;
    socket.join(room);
    console.log(`Client connected: ${socket.id} → room "${room}"`);

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

// ---------------------------------------------------------------------------
// Kafka consumer — Debezium CDC events (replaces MongoDB change stream)
// ---------------------------------------------------------------------------
// Debezium emits a JSON envelope with:
//   op:     'c' (insert), 'u' (update), 'd' (delete), 'r' (snapshot read)
//   before: row state before the change (null for inserts)
//   after:  row state after the change  (null for deletes)
//
// Timestamps arrive as epoch microseconds when time.precision.mode=adaptive
// or as ISO strings when time.precision.mode=connect (our config uses connect).
// ---------------------------------------------------------------------------
function buildOrderPayload(op, before, after) {
    let operation;
    let data;

    if (op === 'c' || op === 'r') {
        operation = 'INSERT';
        data = after;
    } else if (op === 'u') {
        operation = 'UPDATE';
        data = after;
    } else if (op === 'd') {
        operation = 'DELETE';
        data = before;
    } else {
        return null;
    }

    return { operation, data };
}

async function startKafkaConsumer() {
    const broker  = process.env.KAFKA_BROKER || 'localhost:9092';
    const topic   = process.env.KAFKA_TOPIC  || 'ordermonitor.public.orders';

    const kafka = new Kafka({
        clientId: 'order-monitor',
        brokers:  [broker],
        retry: {
            initialRetryTime: 3000,
            retries: 20
        }
    });

    const consumer = kafka.consumer({ groupId: 'order-monitor-group' });

    let connected = false;

    while (!connected) {
        try {
            await consumer.connect();
            connected = true;
        } catch (err) {
            console.error('Kafka connect error, retrying in 5s:', err.message);
            await new Promise((r) => setTimeout(r, 5000));
        }
    }

    await consumer.subscribe({ topic, fromBeginning: false });

    await consumer.run({
        eachMessage: async ({ message }) => {
            if (!message.value) {
                return; // tombstone / delete marker key-only message
            }

            let envelope;

            try {
                envelope = JSON.parse(message.value.toString());
            } catch (err) {
                console.error('Failed to parse Kafka message:', err.message);
                return;
            }

            // Debezium wraps the payload inside a "payload" key when schema is included.
            const payload = envelope.payload || envelope;
            const { op, before, after } = payload;

            const result = buildOrderPayload(op, before, after);

            if (!result) {
                return;
            }

            const { operation, data } = result;

            // Emit to any customer/dashboard room AND to the global room.
            const roomFromDoc = data?.room;

            if (roomFromDoc) {
                io.to(roomFromDoc).emit('order_update', { operation, data });
            }

            io.to(GLOBAL_ROOM).emit('order_update', { operation, data });

            console.log(`[kafka] ${operation} order id=${data?.id}`);
        }
    });

    console.log(`Kafka consumer listening on topic "${topic}"…`);
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function start() {
    await connectToDatabase();
    console.log('Connected to PostgreSQL.');

    // Start Kafka consumer in the background — do not block server startup.
    startKafkaConsumer().catch((err) => {
        console.error('Kafka consumer fatal error:', err.message);
    });

    server.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

start().catch((err) => {
    console.error('Could not connect to PostgreSQL:', err.message);

    server.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
});
