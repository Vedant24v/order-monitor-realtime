require('dotenv').config({ quiet: true });

const { connectToDatabase, getOrdersCollection, client } = require('./db');

async function seed() {
    await connectToDatabase();

    const orders = getOrdersCollection();
    const existingCount = await orders.countDocuments();

    if (existingCount === 0) {
        await orders.insertMany([
            {
                customer_name: 'Anaya Sharma',
                product_name: 'Wireless Keyboard',
                status: 'processing',
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                customer_name: 'Kabir Rao',
                product_name: 'Laptop Sleeve',
                status: 'packed',
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                customer_name: 'Isha Nair',
                product_name: 'Bluetooth Speaker',
                status: 'shipped',
                created_at: new Date(),
                updated_at: new Date()
            }
        ]);

        console.log('Inserted sample orders.');
    } else {
        console.log('Orders collection already has data. Seed skipped.');
    }

    await client.close();
}

seed().catch(async (err) => {
    console.error(err.message);
    await client.close();
    process.exit(1);
});
