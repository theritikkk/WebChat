/**
 * Prometheus metrics for the chat (Socket.io) service.
 * Exposes an HTTP /metrics endpoint on the same port.
 */
import { Registry, Counter, Gauge, Histogram } from "prom-client";

export const register = new Registry();
register.setDefaultLabels({ service: "chat" });

// ── Connections ──────────────────────────────────────────────────────────────
export const socketConnections = new Gauge({
  name: "chat_socket_connections_active",
  help: "Number of active Socket.io connections",
  registers: [register]
});

export const socketConnectionsTotal = new Counter({
  name: "chat_socket_connections_total",
  help: "Total Socket.io connections since startup",
  registers: [register]
});

// ── Messages ─────────────────────────────────────────────────────────────────
export const messagesSentTotal = new Counter({
  name: "chat_messages_sent_total",
  help: "Total messages sent through the chat service",
  labelNames: ["room_id"],
  registers: [register]
});

export const messagesDeliveredTotal = new Counter({
  name: "chat_messages_delivered_total",
  help: "Total message delivery acknowledgements received",
  registers: [register]
});

export const messagesReadTotal = new Counter({
  name: "chat_messages_read_total",
  help: "Total read receipts received",
  registers: [register]
});

// ── Rooms ────────────────────────────────────────────────────────────────────
export const activeRooms = new Gauge({
  name: "chat_active_rooms",
  help: "Number of Socket.io rooms with at least one subscriber",
  registers: [register]
});

// ── WebRTC ───────────────────────────────────────────────────────────────────
export const webrtcCallsTotal = new Counter({
  name: "chat_webrtc_calls_total",
  help: "Total WebRTC call offers initiated",
  registers: [register]
});

export const webrtcCallsActive = new Gauge({
  name: "chat_webrtc_calls_active",
  help: "Currently active WebRTC calls",
  registers: [register]
});

// ── Latency ──────────────────────────────────────────────────────────────────
export const messagePersistDuration = new Histogram({
  name: "chat_message_persist_duration_seconds",
  help: "Time taken to persist a message to the messages service",
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register]
});
