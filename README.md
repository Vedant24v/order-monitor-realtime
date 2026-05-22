# Order Monitor

Realtime order dashboard for the APT interview assignment: database changes propagate to browsers without polling.

## Approach

- **MongoDB Change Streams** watch the `orders` collection for insert/update/delete.
- **Node.js + Express** forwards each change to connected clients via **Socket.IO** (WebSockets).
- **Browser client** subscribes once and updates the table and event feed (including field-level diffs, e.g. `Status: pending → shipped`).
- REST routes (`/orders`) are available for API-driven changes; the server also emits Socket.IO events when change streams are unavailable.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and keep the default values if MongoDB is running locally:

   ```env
   PORT=5000
   MONGODB_URI=mongodb://127.0.0.1:27017
   MONGODB_DB=realtime_orders
   MONGODB_COLLECTION=orders
   ```

3. Seed sample orders:

   ```bash
   npm run seed
   ```

4. Start the server:

   ```bash
   npm start
   ```

5. Open `http://localhost:5000`.

## Realtime Updates

The API emits Socket.IO updates when orders are created, updated, or deleted through the app server.

MongoDB change streams are also enabled for direct database updates. For change streams to work locally, MongoDB must run as a replica set:

```bash
mongod --dbpath C:\data\db --replSet rs0
```

Then initialize it once in `mongosh`:

```javascript
rs.initiate()
```

After that, direct changes in MongoDB will appear in the dashboard automatically.

## Test database changes (Compass or mongosh)

```javascript
use realtime_orders

db.orders.insertOne({
  customer_name: "Your Name",
  product_name: "Mouse",
  status: "pending",
  created_at: new Date(),
  updated_at: new Date()
})

db.orders.updateOne(
  { customer_name: "Your Name" },
  { $set: { status: "delivered", updated_at: new Date() } }
)
```

The dashboard at `http://localhost:5000` should update without refresh when change streams are enabled.
