require('dotenv').config({ quiet: true });

const express = require('express');
const http = require('http');
const path = require('path');
const { ObjectId } = require('mongodb');
const { Server } = require('socket.io');
const cors = require('cors');
const { connectToDatabase, getOrdersCollection } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*'
    }
});

const PORT = process.env.PORT || 5000;
let changeStreamStarted = false;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

app.get('/orders', async (req, res) => {
    try {
        const orders = await getOrdersCollection()
            .find({}, {
                projection: {
                    customer_name: 1,
                    product_name: 1,
                    status: 1,
                    created_at: 1,
                    updated_at: 1
                }
            })
            .sort({ created_at: -1, _id: -1 })
            .toArray();

        res.json(orders.map(toClientOrder));
    } catch (err) {
        console.error('Failed to fetch orders:', err.message);
        res.status(500).json({
            error: 'Failed to fetch orders'
        });
    }
});

app.post('/orders', async (req, res) => {
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

        if (!changeStreamStarted) {
            io.emit('order_update', {
                operation: 'INSERT',
                data: createdOrder
            });
        }

        return res.status(201).json(createdOrder);
    } catch (err) {
        console.error('Failed to create order:', err.message);
        return res.status(500).json({
            error: 'Failed to create order'
        });
    }
});

app.patch('/orders/:id', async (req, res) => {
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

        if (!changeStreamStarted) {
            io.emit('order_update', {
                operation: 'UPDATE',
                data: updatedOrder
            });
        }

        return res.json(updatedOrder);
    } catch (err) {
        console.error('Failed to update order:', err.message);
        return res.status(500).json({
            error: 'Failed to update order'
        });
    }
});

app.delete('/orders/:id', async (req, res) => {
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

        if (!changeStreamStarted) {
            io.emit('order_update', {
                operation: 'DELETE',
                data: deletedOrder
            });
        }

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

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

function startChangeStream() {
    let changeStream;

    try {
        changeStream = getOrdersCollection().watch([], {
            fullDocument: 'updateLookup'
        });
    } catch (err) {
        console.warn('MongoDB change streams are unavailable:', err.message);
        return;
    }

    changeStreamStarted = true;

    changeStream.on('change', (change) => {
        const operation = change.operationType.toUpperCase();
        const data = toClientOrder(change.fullDocument) || {
            _id: change.documentKey?._id?.toString()
        };

        io.emit('order_update', {
            operation,
            data
        });
    });

    changeStream.on('error', (err) => {
        changeStreamStarted = false;
        console.warn('MongoDB change stream stopped:', err.message);
    });

    changeStream.on('close', () => {
        changeStreamStarted = false;
    });

    console.log('Listening for MongoDB order changes...');
}

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
