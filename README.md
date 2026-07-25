# Order Monitor

Realtime order monitoring dashboard powered by Node.js, Express, Socket.IO, and PostgreSQL.

## Features

- ⚡ **Realtime Updates**: Instant order updates via WebSockets (Socket.IO).
- 🗄️ **PostgreSQL Backend**: Persistent data store with cursor-based pagination.
- 🔒 **Bearer Security**: Token-based authentication for REST API & WebSocket connections.
- 📊 **Live Dashboard**: Interactive search filtering, order status metrics, and activity feed.

---

## How to Run from VS Code Terminal

Open the integrated terminal in VS Code (`Ctrl + ~` or **Terminal ➔ New Terminal**) and execute:

### Step 1: Install Dependencies
```powershell
npm install
```

### Step 2: Set Up Environment Variables
Copy `.env.example` to `.env`:
```powershell
cp .env.example .env
```

### Step 3: Initialize Database & Seed Orders
```powershell
# Initialize database schema in PostgreSQL
psql -h 127.0.0.1 -U orderuser -d ordersdb -f db/init.sql

# Seed initial sample orders
npm run seed
```

### Step 4: Start the Application
```powershell
npm start
```

Navigate to **[http://localhost:5000](http://localhost:5000)** in your web browser.

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

Run unit & integration tests from VS Code terminal:
```powershell
npm test
```
