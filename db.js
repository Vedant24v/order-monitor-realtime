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

module.exports = {
    client,
    connectToDatabase,
    getOrdersCollection
};
