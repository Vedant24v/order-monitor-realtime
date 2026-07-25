require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function initDb() {
    try {
        const sqlPath = path.join(__dirname, 'db', 'init.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log('Running db/init.sql...');
        await pool.query(sql);
        console.log('Database initialized successfully.');
    } catch (err) {
        console.error('Database initialization failed:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

initDb();
