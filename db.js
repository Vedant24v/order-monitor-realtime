const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const databaseName = process.env.MONGODB_DB || 'realtime_orders';
const collectionName = process.env.MONGODB_COLLECTION || 'orders';

const client = new MongoClient(uri);

let database;

async function connectToDatabase() {
    if (!database) {
        await client.connect();
        database = client.db(databaseName);
    }

    return database;
}

function getOrdersCollection() {
    if (!database) {
        throw new Error('MongoDB is not connected');
    }

    return database.collection(collectionName);
}

// ---------------------------------------------------------------------------
// Resume token helpers
// ---------------------------------------------------------------------------
// In production, persist this token in Redis (e.g. SET resume_token <value>)
// or in a dedicated "sync_state" MongoDB collection so it survives a server
// restart. An in-memory variable is used here for simplicity.
// ---------------------------------------------------------------------------
let _resumeToken = null;

function saveResumeToken(token) {
    _resumeToken = token;
}

function getResumeToken() {
    return _resumeToken;
}

module.exports = {
    client,
    connectToDatabase,
    getOrdersCollection,
    saveResumeToken,
    getResumeToken
};
