const { Pool } = require('pg');

const pool = new Pool({
    host:     process.env.PG_HOST     || 'localhost',
    port:     parseInt(process.env.PG_PORT || '5432'),
    user:     process.env.PG_USER     || 'orderuser',
    password: process.env.PG_PASSWORD || 'orderpass',
    database: process.env.PG_DATABASE || 'ordersdb',
});

/**
 * Verify connectivity — throws if the database is unreachable.
 */
async function connectToDatabase() {
    const client = await pool.connect();
    client.release();
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

/**
 * GET /orders — paginated, descending by created_at then id.
 * @param {number} limit   - max rows to return
 * @param {string|null} cursor - last seen id (integer, as string) from previous page
 * @returns {{ data: object[], nextCursor: string|null }}
 */
async function getOrders(limit, cursor) {
    let query;
    let values;

    if (cursor) {
        query = `
            SELECT id, customer_name, product_name, status, created_at, updated_at
            FROM orders
            WHERE id < $1
            ORDER BY created_at DESC, id DESC
            LIMIT $2
        `;
        values = [parseInt(cursor, 10), limit];
    } else {
        query = `
            SELECT id, customer_name, product_name, status, created_at, updated_at
            FROM orders
            ORDER BY created_at DESC, id DESC
            LIMIT $1
        `;
        values = [limit];
    }

    const { rows } = await pool.query(query, values);
    const nextCursor = rows.length === limit ? String(rows[rows.length - 1].id) : null;

    return { data: rows, nextCursor };
}

/**
 * POST /orders
 * @param {{ customer_name: string, product_name: string, status: string }} fields
 * @returns {object} the inserted row
 */
async function createOrder(fields) {
    const { rows } = await pool.query(
        `INSERT INTO orders (customer_name, product_name, status, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING *`,
        [fields.customer_name, fields.product_name, fields.status]
    );

    return rows[0];
}

/**
 * PATCH /orders/:id
 * @param {number|string} id
 * @param {object} fields   - subset of { customer_name, product_name, status }
 * @returns {object|null} the updated row, or null if not found
 */
async function updateOrder(id, fields) {
    const allowed = ['customer_name', 'product_name', 'status'];
    const sets = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
        if (fields[key] !== undefined) {
            sets.push(`${key} = $${idx++}`);
            values.push(fields[key]);
        }
    }

    if (sets.length === 0) {
        // Nothing to update — fetch and return existing row.
        const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
        return rows[0] || null;
    }

    sets.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await pool.query(
        `UPDATE orders SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
    );

    return rows[0] || null;
}

/**
 * DELETE /orders/:id
 * @param {number|string} id
 * @returns {object|null} the deleted row, or null if not found
 */
async function deleteOrder(id) {
    const { rows } = await pool.query(
        'DELETE FROM orders WHERE id = $1 RETURNING *',
        [id]
    );

    return rows[0] || null;
}

module.exports = {
    pool,
    connectToDatabase,
    getOrders,
    createOrder,
    updateOrder,
    deleteOrder
};
