# Realtime Order Monitor

A modern, high-performance realtime order monitoring dashboard powered by **Node.js, Express, Socket.IO, and PostgreSQL**.

---

## 🌟 Features

- ⚡ **Realtime Synchronization**: Instant multi-client updates via WebSockets (Socket.IO).
- 🛠️ **Full Interactive CRUD**: Create, Edit, Delete, and 1-Click Status changes directly from the Web UI.
- 🗄️ **PostgreSQL Backend**: Reliable persistence layer with cursor-based pagination.
- 📡 **Kafka / Standalone Dual Mode**: Auto-detects Kafka for CDC or seamlessly runs in standalone PostgreSQL mode.
- 🔒 **Bearer Token Security**: Optional token-based authentication for REST API & WebSockets.
- 📊 **Live Analytics & Event Feed**: Real-time event log tracking every database operation.

---

## 🚀 Simple Steps to Run

Follow these quick steps to get the application up and running:

### Step 1: Install Dependencies
```cmd
npm install
```

### Step 2: Set Up Environment Variables
Copy `.env.example` to create your local `.env` configuration:
```cmd
copy .env.example .env
```

### Step 3: Start PostgreSQL
If using **Docker Desktop**, launch Docker and run:
```cmd
docker run -d --name postgres-db -p 5432:5432 -e POSTGRES_USER=orderuser -e POSTGRES_PASSWORD=orderpass -e POSTGRES_DB=ordersdb postgres:alpine
```
*(If running native PostgreSQL on Windows, ensure the PostgreSQL service is active on port 5432).*

### Step 4: Initialize Database & Seed Sample Orders
```cmd
# Initialize database schema (No psql CLI required)
npm run init-db

# Seed initial sample order data
npm run seed
```

### Step 5: Start the Server
```cmd
npm start
```

Navigate to **[http://localhost:5000](http://localhost:5000)** in your web browser.

---

## 🛠️ API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/orders` | Fetch orders (`?limit=50&cursor=<id>`) |
| `POST` | `/orders` | Create a new order |
| `PATCH` | `/orders/:id` | Update order details / status |
| `DELETE` | `/orders/:id` | Delete an order |
| `GET` | `/health` | Health check status |

---

## 🧪 Testing

Run unit & integration tests:
```cmd
npm test
```
