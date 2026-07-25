require('dotenv').config({ quiet: true });

const { Pool } = require('pg');

const pool = new Pool({
    host:     process.env.PG_HOST     || 'localhost',
    port:     parseInt(process.env.PG_PORT || '5432'),
    user:     process.env.PG_USER     || 'orderuser',
    password: process.env.PG_PASSWORD || 'orderpass',
    database: process.env.PG_DATABASE || 'ordersdb',
});

async function seed() {
    const { rows } = await pool.query('SELECT COUNT(*) AS cnt FROM orders');
    const count = parseInt(rows[0].cnt, 10);

    if (count > 0) {
        console.log('Orders table already has data. Seed skipped.');
        await pool.end();
        return;
    }

    await pool.query(
        `INSERT INTO orders (customer_name, product_name, status, created_at, updated_at) VALUES
            ($1, $2, $3, NOW(), NOW()),
            ($4, $5, $6, NOW(), NOW()),
            ($7, $8, $9, NOW(), NOW())`,
        [
            'Anaya Sharma', 'Wireless Keyboard', 'processing',
            'Kabir Rao',    'Laptop Sleeve',     'packed',
            'Isha Nair',    'Bluetooth Speaker', 'shipped'
        ]
    );

    console.log('Inserted sample orders.');
    await pool.end();
}

seed().catch(async (err) => {
    console.error(err.message);
    await pool.end();
    process.exit(1);
});
