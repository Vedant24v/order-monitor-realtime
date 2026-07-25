# Realtime Order Monitor

A modern, high-performance realtime order monitoring dashboard powered by **Node.js, Express, Socket.IO, PostgreSQL, Debezium CDC, and Kafka**.

---

## 🌟 Features

- ⚡ **Realtime Synchronization**: Instant multi-client updates via WebSockets (Socket.IO).
- 🛠️ **Full Interactive CRUD**: Create, Edit, Delete, and 1-Click Status changes directly from the Web UI.
- 🗄️ **PostgreSQL Persistence**: Reliable relational database layer with cursor-based pagination.
- 🔄 **Debezium CDC + Kafka**: Streaming Change Data Capture from PostgreSQL write-ahead logs (`wal_level=logical`).
- 🔒 **Bearer Token Security**: Optional token-based authentication for REST API & WebSockets.
- 📊 **Live Analytics & Event Feed**: Real-time event log tracking every database operation.

---

## 🏗️ Architecture & Debezium CDC Pipeline

Database writes (INSERT / UPDATE / DELETE) trigger **Debezium CDC** from PostgreSQL write-ahead logs (`wal_level=logical`), streaming events to **Apache Kafka**. The Node.js server consumes the Kafka topic and broadcasts updates via **Socket.IO** to all connected browsers in real time.

```
PostgreSQL (WAL) ──> Debezium Connector ──> Kafka Topic ──> Node.js Consumer ──> Socket.IO ──> Web Browser
```

---

## 🚀 Running the Project

### Option A — Docker Compose (Full Debezium CDC Stack)

This starts PostgreSQL (`wal_level=logical`), Zookeeper, Kafka, Debezium Connect, and the Node.js application in containers:

1. **Start all services:**
   ```bash
   docker compose up -d
   ```

2. **Register Debezium Postgres Connector:**
   ```bash
   npm run register-connector
   ```

3. **Seed Sample Orders:**
   ```bash
   docker compose exec app node seed.js
   ```

4. **Access Dashboard:**
   Open **[http://localhost:5000](http://localhost:5000)** in your browser.

---

### Option B — Local Node.js Setup (Standalone / Local PostgreSQL)

1. **Install Dependencies:**
   ```cmd
   npm install
   ```

2. **Configure Environment:**
   Copy `.env.example` to `.env`:
   ```cmd
   copy .env.example .env
   ```

3. **Start PostgreSQL Service:**
   Ensure PostgreSQL is running locally on port `5432` *(or run via Docker Desktop)*:
   ```cmd
   docker run -d --name postgres-db -p 5432:5432 -e POSTGRES_USER=orderuser -e POSTGRES_PASSWORD=orderpass -e POSTGRES_DB=ordersdb postgres:alpine
   ```

4. **Initialize Database & Seed Data:**
   ```cmd
   npm run init-db
   npm run seed
   ```

5. **Start Application:**
   ```cmd
   npm start
   ```
   Open **[http://localhost:5000](http://localhost:5000)** in your browser.

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
