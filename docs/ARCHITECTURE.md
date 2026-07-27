# WebChat — Enterprise Architecture Specification

This specification covers the decoupled microservices, database storage layout, live WebSocket mechanisms, async message queue, caching, search indexing, file uploads, and monitoring infrastructure.

---

## Container C4 Diagram

The diagram below details the container layout, entry points, persistence layers, and the async message pipeline:

```mermaid
graph TB
  subgraph Client Application
  React[React / Vite Client]
  end

  subgraph API Gateway Layer
  Gateway[API Gateway :4000]
  end

  subgraph Microservices Layer
  Auth[Auth Service :3001]
  Messages[Messages Service :3003]
  Chat[Chat Service :5000]
  Uploads[Uploads Service :3004]
  Worker[Message Worker]
  end

  subgraph Data & Search Stores
  PG[(PostgreSQL)]
  MG[(MongoDB)]
  RD[(Redis Cache & PubSub)]
  Elastic[(Elasticsearch)]
  RMQ[(RabbitMQ)]
  S3[(AWS S3)]
  end

  React -->|HTTPS| Gateway
  React -->|WS / WebRTC Signaling| Chat
  React -->|Presigned PUT| S3
  
  Gateway -->|HTTP Proxy /auth| Auth
  Gateway -->|HTTP Proxy /messages| Messages
  Gateway -->|HTTP Proxy /upload| Uploads
  Gateway -->|HTTP Proxy /presence| Chat
  
  Chat -->|Assert Membership| Auth
  Chat -->|HTTP Fallback Persist| Messages
  Chat -->|Publish Jobs| RMQ
  Messages -->|Assert Membership| Auth
  Uploads -->|Assert Membership| Auth
  
  RMQ -->|Consume| Worker
  Worker -->|Write| MG
  Worker -->|Index| Elastic
  Worker -->|Publish Confirmed| RD
  RD -->|message_confirmed| Chat
  
  Auth -->|Read/Write| PG
  Messages -->|Read/Write| MG
  Messages -->|Index Docs| Elastic
  Messages -->|Cache Lookups| RD
  
  Chat -->|Adapter + Presence + Cache| RD
  Uploads -->|Presign URLs| S3
```

---

## Async Message Delivery Pipeline

Messages are persisted asynchronously via RabbitMQ for non-blocking real-time performance:

```mermaid
sequenceDiagram
  autonumber
  actor UserA as Sender
  participant Chat as Chat Service
  participant RMQ as RabbitMQ
  participant Worker as Message Worker
  participant DB as MongoDB
  participant ES as Elasticsearch
  participant Redis as Redis Pub/Sub
  actor UserB as Receiver

  UserA->>Chat: socket.emit("send_message", payload)
  Chat-->>UserA: Optimistic broadcast { _id: tempId, status: "sent" }
  Chat-->>UserB: Optimistic broadcast { _id: tempId, status: "sent" }
  Chat->>RMQ: publishMessage({ roomId, content, tempId, ... })
  
  RMQ->>Worker: Consume message job
  Worker->>DB: Message.create() → saved doc with real _id
  Worker->>ES: indexInES(doc) [best-effort]
  Worker->>Redis: PUBLISH webchat:message:persisted { tempId, message }
  
  Redis-->>Chat: Subscribe receives confirmation
  Chat-->>UserA: emit("message_confirmed", { tempId, message })
  Chat-->>UserB: emit("message_confirmed", { tempId, message })
  
  Note over UserA, UserB: Clients swap tempId for real Mongo _id
```

**Fallback**: If RabbitMQ is unavailable, Chat calls Messages HTTP API synchronously and emits `message_confirmed` directly.

---

## Message Delivery & Read Receipts Flow

WebChat tracks messages from the initial socket transmit through to final display:

```mermaid
sequenceDiagram
  autonumber
  actor UserA as Sender (User A)
  participant Chat as Chat Service
  participant Msg as Messages Service
  participant DB as MongoDB
  actor UserB as Receiver (User B)

  UserA->>Chat: socket.emit("send_message", payload)
  Chat-->>UserB: socket.emit("receive_message", message)
  
  Note over UserB: Message received in memory
  UserB->>Chat: socket.emit("message_ack", { messageId, roomId })
  Chat->>Msg: PATCH /api/v1/rooms/:id/messages/:msgId/ack
  Msg->>DB: Update deliveries (status: "delivered")
  Chat-->>UserA: socket.emit("message_status", { messageId, status: "delivered" })

  Note over UserB: Message scrolled into view (IntersectionObserver)
  UserB->>Chat: socket.emit("mark_read", { messageId, roomId })
  Chat->>Msg: PATCH /api/v1/rooms/:id/messages/:msgId/read
  Msg->>DB: Update deliveries (status: "read")
  Chat-->>UserA: socket.emit("message_status", { messageId, status: "read" })
```

---

## WebRTC Video Call Signaling Flow

Video calls are established peer-to-peer over the browser RTCPeerConnection API. The Socket.io connection serves as the low-latency signaling channel:

```mermaid
sequenceDiagram
  autonumber
  actor UserA as Peer A (Caller)
  participant Chat as Chat Service (Signaling Server)
  actor UserB as Peer B (Callee)

  UserA->>Chat: socket.emit("call_offer", { callId, roomId, offer })
  Chat-->>UserB: socket.emit("call_offer", { from_user_id, offer, callId })
  
  Note over UserB: Accept call & get media streams
  UserB->>Chat: socket.emit("call_answer", { callId, targetUserId, answer })
  Chat-->>UserA: socket.emit("call_answer", { from_user_id, answer, callId })

  loop ICE Candidate Exchange
  UserA->>Chat: socket.emit("call_ice_candidate", { callId, targetUserId, candidate })
  Chat-->>UserB: socket.emit("call_ice_candidate", { candidate })
  UserB->>Chat: socket.emit("call_ice_candidate", { callId, targetUserId, candidate })
  Chat-->>UserA: socket.emit("call_ice_candidate", { candidate })
  end

  Note over UserA, UserB: P2P Media Streams established
```

---

## Distributed Presence (Redis-backed)

Presence is tracked globally across all Chat service instances via Redis:

```mermaid
sequenceDiagram
  autonumber
  actor User as User connects
  participant Chat1 as Chat Pod 1
  participant Redis as Redis
  participant Chat2 as Chat Pod 2

  User->>Chat1: Socket.io connect
  Chat1->>Redis: SET presence:{userId} { socketId, instance } EX 300
  Chat1->>Redis: ZADD presence:online {userId}
  Chat1-->>User: emit("user_online")
  
  loop Every 60s (heartbeat)
  Chat1->>Redis: EXPIRE presence:{userId} 300
  end

  Note over Chat2: Another service queries presence
  Chat2->>Redis: GET presence:{userId}
  Redis-->>Chat2: { online: true }

  User->>Chat1: Socket disconnect
  Chat1->>Redis: DEL presence:{userId} (only if socketId matches)
  Chat1->>Redis: ZREM presence:online {userId}
  Chat1-->>User: emit("user_offline")
```

---

## Elasticsearch Indexing Flow

Full-text search routes queries to Elasticsearch. If the cluster is unavailable, queries seamlessly fallback to MongoDB regex.

```mermaid
graph LR
  subgraph Creation Flow
  MsgPost[POST /messages] --> MongoSave[Save to MongoDB]
  MongoSave --> ESIndex[Index in Elasticsearch]
  QueuePersist[Worker persists] --> MongoSave2[Save to MongoDB]
  MongoSave2 --> ESIndex2[Index in Elasticsearch]
  end

  subgraph Search Flow
  SearchReq[GET /messages?q=hello] --> IsESReady{Elasticsearch Online?}
  IsESReady -->|Yes| ESSearch[Query Elasticsearch]
  IsESReady -->|No| MongoRegex[Fallback: MongoDB regex]
  end
```

---

## Prometheus Scrape Topology

The monitoring topology shows how Prometheus collects metrics from all instrumented services.

```mermaid
graph TD
  Gateway[Gateway Service] -->|Exposes /metrics| GatewayEndpoint[/metrics]
  Chat[Chat Service] -->|Exposes /metrics| ChatEndpoint[/metrics]
  Messages[Messages Service] -->|Exposes /metrics| MessagesEndpoint[/metrics]
  
  Prometheus[(Prometheus Server)] -->|Scrape Job: Gateway| GatewayEndpoint
  Prometheus -->|Scrape Job: Chat| ChatEndpoint
  Prometheus -->|Scrape Job: Messages| MessagesEndpoint
  
  Grafana[Grafana Dashboard] -->|Queries| Prometheus
```

---

## Security Architecture

### Authentication & Session Management

```
Login → { accessToken (15m JWT), refreshToken (7d opaque) }
         │                         │
         │                         └─ Stored as SHA-256 hash in refresh_tokens table (PostgreSQL)
         │                            Raw token never persisted
         └─ Verified per-request (gateway → auth service | direct JWT.verify())

Logout → POST /api/v1/auth/logout { refreshToken }
         │
         └─ refresh_tokens.destroy({ where: { token_hash: sha256(raw) } })
            Token invalidated server-side; cannot be reused even if intercepted
```

### JWT Secret Guard

All 4 JWT-consuming services (`auth/lib/tokens.js`, `chat/lib/auth.js`, `messages/lib/jwt.js`, `uploads/routes/upload.js`) call `process.exit(1)` on startup if `NODE_ENV === "production"` and `JWT_SECRET` equals the default dev value.

### Metrics Access Control

`/metrics` endpoints in gateway, chat, and messages services are protected by `internalOnly` middleware:

```
Request IP → loopback (127.x, ::1) or RFC-1918 (10.x, 172.16-31.x, 192.168.x)?
  YES → next() → serve Prometheus metrics
  NO  → 403 Forbidden
```

### Presence API

`GET /api/v1/presence` and `GET /api/v1/presence/:userId` require a valid Bearer JWT (`requireBearerToken` middleware in Chat service). Unauthenticated requests get `401 Unauthorized`.

### Input Sanitization

Message content is sanitized via `sanitize-html` with a zero-tag allowlist in two places:
1. **Messages service** (`routes/messages.js`) — on HTTP create and edit
2. **Message worker** (`src/index.js`) — on RabbitMQ queue consume

This ensures XSS payloads are neutralized regardless of which persist path is used.

### Database Schema Management

`sequelize.sync({ alter: true })` (unsafe for production) has been replaced with an idempotent migration runner (`services/auth/src/lib/migrate.js`). Migrations are applied in alphabetical order and tracked in a `_migrations` ledger table.

### Distributed Tracing

```mermaid
graph LR
  GW[Gateway tracing.js] --> OTEL[OTLPTraceExporter]
  AU[Auth tracing.js]     --> OTEL
  MSG[Messages tracing.js]--> OTEL
  CH[Chat tracing.js]     --> OTEL
  OTEL --> Collector[OTLP Collector]
  Collector --> Jaeger[Jaeger / Grafana Tempo / X-Ray]
```

All 4 HTTP services bootstrap OpenTelemetry as their **first import**, ensuring auto-instrumentation patches Node.js internals before any application code runs.

---

## Automated Testing & Multi-Instance Verification Architecture

WebChat features a non-blocking integration test harness designed for local development speed and high-fidelity CI verification:

```mermaid
graph TD
  subgraph Test Harness
  Jest[Jest Runner / ES Modules]
  end

  subgraph In-Memory Data Strategy
  SQLite[(sqlite::memory: Auth)]
  MongoMem[(mongodb-memory-server Messages)]
  end

  subgraph Multi-Instance Socket Verification
  PodA[Chat Instance A :portA]
  PodB[Chat Instance B :portB]
  Redis7[(Redis 7 Service Container :6379)]
  end

  Jest --> AuthTest[services/auth/test/auth.test.js]
  AuthTest --> SQLite
  
  Jest --> MsgTest[services/messages/test/messages.test.js]
  MsgTest --> MongoMem

  Jest --> ChatTest[services/chat/test/chat.test.js]
  ChatTest --> PodA

  Jest --> MultiPodTest[services/chat/test/chat-multi-instance.test.js]
  MultiPodTest --> PodA & PodB
  PodA -->|"@socket.io/redis-adapter"| Redis7
  PodB -->|"@socket.io/redis-adapter"| Redis7
```

### Multi-Instance Redis Adapter Verification

To validate horizontal WebSocket scaling, `chat-multi-instance.test.js` spins up 2 independent Socket.io server instances on dynamic ports (`portA`, `portB`), both attached to `@socket.io/redis-adapter` over Redis.

When Client 1 sends a message to Pod A, Pod A emits over Redis Pub/Sub, and Pod B receives and broadcasts the message to Client 2 on Pod B in real-time. This confirms multi-instance real-time fanout without single-instance bottlenecks.

