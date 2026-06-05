# 🏢 WebChat — Enterprise Architecture Specification

This specification covers the decoupled microservices, database storage layout, live WebSocket mechanisms, caching, search indexing, and monitoring infrastructure.

---

## 📦 Container C4 Diagram

The diagram below details the container layout, entry points, and persistence layers of WebChat:

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
  end

  subgraph Data & Search Stores
    Postgres[(PostgreSQL)]
    Mongo[(MongoDB)]
    Redis[(Redis Cache & PubSub)]
    Elastic[(Elasticsearch)]
  end

  React -->|HTTPS| Gateway
  React -->|WS / WebRTC Signaling| Chat
  
  Gateway -->|HTTP Proxy /auth| Auth
  Gateway -->|HTTP Proxy /messages| Messages
  
  Chat -->|Assert Membership| Auth
  Chat -->|HTTP Post Msg| Messages
  Messages -->|Assert Membership| Auth
  
  Auth -->|Read/Write| Postgres
  Messages -->|Read/Write| Mongo
  Messages -->|Index Docs| Elastic
  
  Chat & Messages -->|Cache Lookups & PubSub| Redis
```

---

## ✉️ Message Delivery & Read Receipts Flow

WebChat tracks messages from the initial socket transmit through to final display. The flow diagram below details events:

```mermaid
sequenceDiagram
  autonumber
  actor UserA as Sender (User A)
  participant Chat as Chat Service
  participant Msg as Messages Service
  participant DB as MongoDB
  actor UserB as Receiver (User B)

  UserA->>Chat: socket.emit("send_message", payload)
  Chat->>Msg: POST /api/v1/rooms/:id/messages
  Msg->>DB: Save document (status: "sent")
  Msg-->>Chat: Returns saved document
  Chat-->>UserA: Ack callback { ok: true, id: messageId }
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

## 📹 WebRTC Video Call Signaling Flow

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

## 🔍 Elasticsearch Indexing Flow

Full-text search routes queries to Elasticsearch. If the cluster is unavailable, queries seamlessly fallback to MongoDB regex.

```mermaid
graph LR
  subgraph Creation Flow
    MsgPost[POST /messages] --> MongoSave[Save to MongoDB]
    MongoSave --> ESIndex[Index in Elasticsearch]
  end

  subgraph Search Flow
    SearchReq[GET /messages?q=hello] --> IsESReady{Elasticsearch Online?}
    IsESReady -->|Yes| ESSearch[Query Elasticsearch]
    IsESReady -->|No| MongoRegex[Fallback: MongoDB regex]
  end
```

---

## 📊 Prometheus Scrape Topology

The monitoring topology shows how Prometheus collects metrics from gateway, chat, and messages.

```mermaid
graph TD
  Gateway[Gateway Service] -->|Exposes /metrics| GatewayEndpoint[/metrics]
  Chat[Chat Service] -->|Exposes /metrics| ChatEndpoint[/metrics]
  
  Prometheus[(Prometheus Server)] -->|Scrape Job: Gateway| GatewayEndpoint
  Prometheus -->|Scrape Job: Chat| ChatEndpoint
  
  Grafana[Grafana Dashboard] -->|Queries| Prometheus
```
