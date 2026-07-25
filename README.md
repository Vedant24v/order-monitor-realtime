# Realtime Order Monitor

A modern, high-performance realtime order monitoring dashboard powered by **Node.js, Express, Socket.IO, and PostgreSQL**.

---

## 🌟 Features

- ⚡ **Realtime Synchronization**: Instant multi-client updates via WebSockets (Socket.IO).
- 🛠️ **Full Interactive CRUD**: Create, Edit, Delete, and 1-Click Status changes directly from the Web UI.
- 🗄️ **PostgreSQL Backend**: Reliable persistence layer with cursor-based pagination.
- 🔄 **Dual Execution Modes**:
  - **Standalone PostgreSQL Mode** *(Default)*: Direct, fast local execution without external dependencies.
  - **Debezium CDC + Kafka Mode** *(Optional)*: Asynchronous Change Data Capture from PostgreSQL write-ahead logs (WAL).
- 🔒 **Bearer Token Security**: Optional token-based authentication for REST API & WebSockets.
- 📊 **Live Analytics & Event Feed**: Real-time event log tracking every database operation.

---

## 🏗️ Architecture & Debezium CDC

### 1. Standalone PostgreSQL Mode (Default)
In standalone mode, the Node.js server reads and writes directly to PostgreSQL. REST operations instantly trigger Socket.IO WebSocket broadcasts (`order_update`), updating every connected browser dashboard in real time.

```
┌────────────────────────────────┐
│  Browser (Socket.IO Client)    │
└───────────────┬────────────────┘
                │ WebSocket / REST
┌───────────────▼────────────────┐
│  Node.js / Express Server      │
└───────────────┬────────────────┘
                │ SQL Queries (pg)
┌───────────────▼────────────────┐
│  PostgreSQL Database           │
└────────────────────────────────┘
```

### 2. Debezium CDC + Kafka Mode (Optional Enterprise Setup)
For enterprise microservice architectures, PostgreSQL can be configured with `wal_level=logical`. Database writes trigger **Debezium CDC**, streaming row-level mutations to **Apache Kafka**. The Node.js server consumes Kafka topics and broadcasts updates, ensuring even external database writes propagate to browsers in real time.

```
PostgreSQL (WAL) ──> Debezium Connector ──> Kafka Topic ──> Node.js Consumer ──> Socket.IO ──> Browser
```

---

## 🚀 Simple Steps to Run (Standalone Mode)

Follow these quick steps to get the application up and running locally:

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
Ensure your local PostgreSQL service is running on port `5432` *(or launch a container via Docker Desktop)*:
```cmd
docker run -d --name postgres-db -p 5432:5432 -e POSTGRES_USER=orderuser -e POSTGRES_PASSWORD=orderpass -e POSTGRES_DB=ordersdb postgres:alpine
```

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

## 🔄 Steps to Run with Debezium CDC & Kafka (Optional)

If you wish to run the app with full **Change Data Capture (CDC)** via Debezium and Kafka:

### 1. Enable PostgreSQL Logical Replication (`wal_level=logical`)
Launch PostgreSQL with replication flags enabled:
```cmd
docker run -d --name postgres-db -p 5432:5432 -e POSTGRES_USER=orderuser -e POSTGRES_PASSWORD=orderpass -e POSTGRES_DB=ordersdb postgres:alpine postgres -c wal_level=logical -c max_replication_slots=4 -c max_wal_senders=4
```

### 2. Start Kafka & Zookeeper
Launch Zookeeper and Kafka broker listening on `localhost:9092`.

### 3. Register Debezium Postgres Connector
POST the connector configuration to Kafka Connect (`http://localhost:8083/connectors`):
```json
{
  "name": "postgres-orders-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "localhost",
    "database.port": "5432",
    "database.user": "orderuser",
    "database.password": "orderpass",
    "database.dbname": "ordersdb",
    "topic.prefix": "ordermonitor",
    "table.include.list": "public.orders",
    "plugin.name": "pgoutput"
  }
}
```

### 4. Configure `.env` & Start App
Ensure `.env` contains:
```env
KAFKA_BROKER=localhost:9092
KAFKA_TOPIC=ordermonitor.public.orders
```
Start the application:
```cmd
npm start
```
The application will automatically detect Kafka, subscribe to the Debezium CDC topic, and broadcast database row changes live to all WebSocket clients!

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
