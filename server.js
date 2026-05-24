require('dotenv').config({ quiet: true });

const express = require('express');
const http = require('http');
const path = require('path');
const { ObjectId } = require('mongodb');
const { Server } = require('socket.io');
const cors = require('cors');
const {
    connectToDatabase,
    getOrdersCollection,
    saveResumeToken,
    getResumeToken
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
// Helpers
// ---------------------------------------------------------------------------
function toClientOrder(order) {
    if (!order) {
        return null;
    }

    return {
        ...order,
        _id: order._id?.toString()
    };
}

function parseObjectId(id) {
    if (!ObjectId.isValid(id)) {
        return null;
    }

    return new ObjectId(id);
}

// ---------------------------------------------------------------------------
// REST routes (Section 2 + Section 4 + Section 5)
// ---------------------------------------------------------------------------

/**
 * GET /orders
 * Supports cursor-based pagination:
 *   ?limit=50          – page size (default 50, max 200)
 *   ?cursor=<_id>      – last seen _id from previous page (returns docs older than this id)
 *
 * The change stream is the sole emitter of order_update events; these routes
 * only read/write MongoDB (Section 2).
 */
app.get('/orders', requireBearerToken, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const cursor = req.query.cursor;

        const query = {};

        if (cursor && ObjectId.isValid(cursor)) {
            // Return orders with _id less than the cursor (older, for descending sort)
            query._id = { $lt: new ObjectId(cursor) };
        }

        const orders = await getOrdersCollection()
            .find(query, {
                projection: {
                    customer_name: 1,
                    product_name: 1,
                    status: 1,
                    created_at: 1,
                    updated_at: 1
                }
            })
            .sort({ created_at: -1, _id: -1 })
            .limit(limit)
            .toArray();

        const nextCursor = orders.length === limit
            ? orders[orders.length - 1]._id.toString()
            : null;

        res.json({
            data: orders.map(toClientOrder),
            nextCursor
        });
    } catch (err) {
        console.error('Failed to fetch orders:', err.message);
        res.status(500).json({
            error: 'Failed to fetch orders'
        });
    }
});

app.post('/orders', requireBearerToken, async (req, res) => {
    try {
        const order = {
            customer_name: String(req.body.customer_name || '').trim(),
            product_name: String(req.body.product_name || '').trim(),
            status: String(req.body.status || 'pending').trim(),
            created_at: new Date(),
            updated_at: new Date()
        };

        if (!order.customer_name || !order.product_name) {
            return res.status(400).json({
                error: 'customer_name and product_name are required'
            });
        }

        const result = await getOrdersCollection().insertOne(order);
        const createdOrder = toClientOrder({ ...order, _id: result.insertedId });

        // The change stream is the sole emitter of order_update events (Section 2).
        // No io.emit() here.

        return res.status(201).json(createdOrder);
    } catch (err) {
        console.error('Failed to create order:', err.message);
        return res.status(500).json({
            error: 'Failed to create order'
        });
    }
});

app.patch('/orders/:id', requireBearerToken, async (req, res) => {
    try {
        const _id = parseObjectId(req.params.id);

        if (!_id) {
            return res.status(400).json({
                error: 'Invalid order id'
            });
        }

        const update = {
            updated_at: new Date()
        };

        for (const field of ['customer_name', 'product_name', 'status']) {
            if (req.body[field] !== undefined) {
                update[field] = String(req.body[field]).trim();
            }
        }

        const result = await getOrdersCollection().updateOne(
            { _id },
            { $set: update }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                error: 'Order not found'
            });
        }

        const resultOrder = await getOrdersCollection().findOne({ _id });
        const updatedOrder = toClientOrder(resultOrder);

        // The change stream is the sole emitter of order_update events (Section 2).
        // No io.emit() here.

        return res.json(updatedOrder);
    } catch (err) {
        console.error('Failed to update order:', err.message);
        return res.status(500).json({
            error: 'Failed to update order'
        });
    }
});

app.delete('/orders/:id', requireBearerToken, async (req, res) => {
    try {
        const _id = parseObjectId(req.params.id);

        if (!_id) {
            return res.status(400).json({
                error: 'Invalid order id'
            });
        }

        const result = await getOrdersCollection().findOne({ _id });

        if (!result) {
            return res.status(404).json({
                error: 'Order not found'
            });
        }

        await getOrdersCollection().deleteOne({ _id });
        const deletedOrder = toClientOrder(result);

        // The change stream is the sole emitter of order_update events (Section 2).
        // No io.emit() here.

        return res.json(deletedOrder);
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
        database: 'mongodb',
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
// Change stream (Section 1)
// ---------------------------------------------------------------------------
function startChangeStream() {
    let changeStream;
    const resumeToken = getResumeToken();

    const watchOptions = { fullDocument: 'updateLookup' };

    if (resumeToken) {
        watchOptions.resumeAfter = resumeToken;
        console.log('Resuming change stream from saved token.');
    }

    try {
        changeStream = getOrdersCollection().watch([], watchOptions);
    } catch (err) {
        console.error('MongoDB change streams unavailable:', err.message);
        console.log('Retrying change stream in 2 000 ms…');
        setTimeout(startChangeStream, 2000);
        return;
    }

    changeStream.on('change', (change) => {
        // Persist token before emitting so a crash after a write is still safe.
        saveResumeToken(change._id);

        const operation = change.operationType.toUpperCase();
        const data = toClientOrder(change.fullDocument) || {
            _id: change.documentKey?._id?.toString()
        };

        const payload = { operation, data };

        // Emit to the matching room (customer/dashboard scope) AND always
        // broadcast to the global room so the default dashboard stays current.
        const roomFromDoc = data?.room; // optional field on the document itself

        if (roomFromDoc) {
            io.to(roomFromDoc).emit('order_update', payload);
        }

        io.to(GLOBAL_ROOM).emit('order_update', payload);
    });

    changeStream.on('error', (err) => {
        console.error('Change stream error:', err.message);

        changeStream.close().catch(() => {});

        console.log('Retrying change stream in 2 000 ms…');
        setTimeout(startChangeStream, 2000);
    });

    changeStream.on('close', () => {
        console.log('Change stream closed.');
    });

    console.log('Listening for MongoDB order changes…');
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function start() {
    await connectToDatabase();
    startChangeStream();

    server.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

start().catch((err) => {
    console.error('Could not connect to MongoDB:', err.message);

    server.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
});
