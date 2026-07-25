# Order Monitor

Realtime order monitoring dashboard powered by Node.js, Express, Socket.IO, and PostgreSQL.

## Features

- ⚡ **Realtime Updates**: Instant order updates via WebSockets (Socket.IO).
- 🗄️ **PostgreSQL Backend**: Persistent data store with cursor-based pagination.
- 🔒 **Bearer Security**: Token-based authentication for REST API & WebSocket connections.
- 📊 **Live Dashboard**: Interactive search filtering, order status metrics, and activity feed.

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Copy `.env.example` to `.env`:
```env
PORT=5000
PG_HOST=127.0.0.1
PG_PORT=5432
PG_USER=orderuser
PG_PASSWORD=orderpass
PG_DATABASE=ordersdb
API_TOKEN=
```

### 3. Initialize Database & Seed
```bash
# Initialize database schema
psql -h 127.0.0.1 -U orderuser -d ordersdb -f db/init.sql

# Seed sample data
npm run seed
```

### 4. Start Server
```bash
npm start
```
Open [http://localhost:5000](http://localhost:5000) in your browser.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/orders` | List orders (`?limit=50&cursor=<id>`) |
| `POST` | `/orders` | Create a new order |
| `PATCH` | `/orders/:id` | Update order details |
| `DELETE` | `/orders/:id` | Delete an order |
| `GET` | `/health` | Health check endpoint |

---

## Testing

Run unit & integration tests:
```bash
npm test
```
