# WebChat 🚀

A **production-ready**, horizontally-scalable real-time chat platform built with a Node.js microservices architecture.

[![CI](https://github.com/theritikkk/WebChat/actions/workflows/ci.yml/badge.svg)](https://github.com/theritikkk/WebChat/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Architecture Overview

```
Browser / Client
      │
      ▼
┌─────────────────────────────────────────────────────┐
│  API Gateway  :4000  (rate-limit · proxy · CORS)    │
└──────┬────────────┬──────────────┬──────────────────┘
       │            │              │
       ▼            ▼              ▼
  Auth Service  Messages Svc  Uploads Svc
    :3001          :3003          :3004
  (Postgres)    (Mongo+ES)    (MinIO presign)
                                   │
       ┌───────────────────────────┘
       │        Direct PUT (binary, bypasses app servers)
       ▼
  MinIO :9000  (S3-compatible object storage)

Browser ──WebSocket──► Chat Service :5000 ×3 replicas
                              │
                 ┌────────────┴────────────────┐
                 │  Redis :6379                 │
                 │  • Socket.io adapter         │
                 │  • Distributed presence      │
                 │  • Membership cache          │
                 └────────────┬────────────────┘
                              │
                              ▼
                    RabbitMQ :5672  (durable queue)
                              │
                    ┌─────────▼──────────┐
                    │  Message Worker    │  ×2 replicas
                    │  (AMQP consumer)   │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │    MongoDB :27017   │
                    └─────────┬──────────┘
                              │
                    Elasticsearch :9200  (full-text search)
```

---

## Services

| Service | Port | Description |
|---------|------|-------------|
| **gateway** | 4000 | Reverse proxy, rate limiting, CORS |
| **auth** | 3001 | JWT auth, user management, rooms (Postgres) |
| **messages** | 3003 | Message history, read receipts, ES search (Mongo) |
| **chat** | 5000 | Socket.io real-time engine, WebRTC signaling |
| **uploads** | 3004 | MinIO presigned URL generation for file uploads |
| **message-worker** | — | RabbitMQ consumer → MongoDB + Elasticsearch |

---

## Key Features

| Feature | Implementation |
|---------|---------------|
| ⚡ Real-time messaging | Socket.io with Redis adapter (multi-instance) |
| 🌐 Distributed presence | Redis-backed cross-instance user online/offline |
| 🐇 Message queue | RabbitMQ → Message Worker → MongoDB (async persist) |
| 📁 File uploads | MinIO presigned PUT URLs — binary never hits app servers |
| 🔍 Full-text search | Elasticsearch with MongoDB fallback |
| 📞 WebRTC calls | Peer-to-peer video/audio via Socket.io signaling |
| ✅ Read receipts | Per-user delivery + read tracking in MongoDB |
| 🔒 Auth | JWT access (15 min) + refresh (7 day) tokens |
| 📊 Metrics | Prometheus + Grafana dashboards |
| 🔁 Horizontal scale | Chat ×3, Worker ×2, Redis adapter, HPA |

---

## Quick Start (Local Dev)

### Prerequisites
- Node.js ≥ 20
- Docker + Docker Compose

### 1 — Clone & configure
```bash
git clone https://github.com/theritikkk/WebChat.git
cd WebChat
cp .env.example .env
# Edit .env — set a real JWT_SECRET
```

### 2 — Start infrastructure
```bash
# Core services (Postgres, Mongo, Redis, RabbitMQ, MinIO, Elasticsearch)
docker compose up -d postgres mongo redis rabbitmq minio elasticsearch
```

### 3 — Install dependencies
```bash
npm install
cd services/auth       && npm install && cd ../..
cd services/messages   && npm install && cd ../..
cd services/chat       && npm install && cd ../..
cd services/gateway    && npm install && cd ../..
cd services/uploads    && npm install && cd ../..
cd services/message-worker && npm install && cd ../..
```

### 4 — Run all services
```bash
# Terminal 1 — Auth
PORT_AUTH=3001 node services/auth/src/index.js

# Terminal 2 — Messages
PORT_MESSAGES=3003 node services/messages/src/index.js

# Terminal 3 — Message Worker (RabbitMQ consumer)
node services/message-worker/src/index.js

# Terminal 4 — Chat (Socket.io)
PORT_CHAT=5000 node services/chat/src/index.js

# Terminal 5 — Uploads
PORT_UPLOADS=3004 node services/uploads/src/index.js

# Terminal 6 — Gateway
PORT_GATEWAY=4000 node services/gateway/src/index.js

# Terminal 7 — Frontend
cd apps/client && npm run dev
```

**Or with the workspace:**
```bash
# From VS Code: Run > Run All Tasks (defined in .vscode/tasks.json)
```

---

## Message Queue Flow

```
send_message (Socket.io)
        │
        ├─► Optimistic broadcast to room (instant)
        │
        └─► publishMessage() → RabbitMQ "webchat.messages" exchange
                                        │
                             Message Worker consumes
                                        │
                             MongoDB.create() + ES.index()
                                        │
                             message_confirmed → room (final ID)
```

**Fallback**: If RabbitMQ is unavailable, the chat service transparently falls back to the original synchronous HTTP call to the messages service.

---

## File Upload Flow

```
1. Client: POST /api/v1/upload/presign { filename, contentType, roomId }
2. Gateway → Uploads Service → generates MinIO presigned PUT URL (5 min TTL)
3. Client: PUT <presignedUrl> <binary file>  (direct to MinIO — zero app server load)
4. Client: send_message { roomId, file_url: "<public MinIO URL>", message_type: "image" }
```

---

## Distributed Presence

```
User A connects to Chat-Pod-1
  → Redis: SET presence:userA { socketId, instance, connectedAt } EX 300
  → Redis: ZADD presence:online userA

Chat-Pod-2 checks if User A is online:
  → Redis: GET presence:userA → { ... } ✓ online

User A disconnects from Chat-Pod-1:
  → Redis: DEL presence:userA
  → Redis: ZREM presence:online userA
```

Heartbeat every 60s refreshes the TTL so presence survives brief network blips.

---

## Kubernetes Deployment

```bash
# Create namespace and apply all manifests
kubectl apply -k deploy/k8s/base/

# Verify pods
kubectl get pods -n webchat

# Scale workers horizontally
kubectl scale deployment message-worker --replicas=4 -n webchat
kubectl scale deployment chat --replicas=5 -n webchat
```

See [`docs/KUBERNETES.md`](docs/KUBERNETES.md) for full deployment guide.

---

## Monitoring

```bash
# Start Prometheus + Grafana
docker compose --profile monitoring up -d

# Grafana UI  → http://localhost:3000  (admin / webchat)
# RabbitMQ UI → http://localhost:15672 (webchat / webchat)
# MinIO UI    → http://localhost:9001  (minioadmin / minioadmin)
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | Login, returns access + refresh tokens |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| GET | `/api/v1/rooms` | List user's rooms |
| POST | `/api/v1/rooms` | Create a room |
| GET | `/api/v1/rooms/:id/messages` | Paginated message history |
| GET | `/api/v1/rooms/:id/messages?q=term` | Full-text search |
| POST | `/api/v1/upload/presign` | Get presigned upload URL |
| GET | `/api/v1/upload/signed-url` | Get presigned download URL |
| GET | `/api/v1/presence/:userId` | Check if user is online |

---

## Environment Variables

See [`.env.example`](.env.example) for the full list. Key variables:

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Shared JWT signing key (all services) |
| `REDIS_URL` | Redis for Socket.io adapter + presence |
| `RABBITMQ_URL` | RabbitMQ for async message persistence |
| `MINIO_*` | MinIO/S3 object storage credentials |
| `ELASTICSEARCH_URL` | Full-text search engine |
| `MONGO_URI` | Messages database |
| `DATABASE_URL` | Auth database (Postgres) |

---

## Tech Stack

**Backend**: Node.js · Express · Socket.io · Mongoose · Sequelize  
**Queues**: RabbitMQ (amqplib)  
**Databases**: PostgreSQL · MongoDB · Redis · Elasticsearch  
**Storage**: MinIO (S3-compatible)  
**Infra**: Docker Compose · Kubernetes · GitHub Actions CI/CD  
**Observability**: Prometheus · Grafana · k6 load testing
