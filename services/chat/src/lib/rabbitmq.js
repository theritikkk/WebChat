/**
 * RabbitMQ publisher for the Chat service.
 *
 * When RABBITMQ_URL is set, `send_message` events are published to the
 * "webchat.messages" exchange (direct) instead of calling the Messages HTTP
 * API synchronously.  The Message Worker service consumes from this exchange
 * and writes to MongoDB + Elasticsearch.
 *
 * If RabbitMQ is unavailable (env var unset or connection fails), the module
 * gracefully falls back to returning `null` so callers can use the HTTP path.
 */

import amqplib from "amqplib";

const EXCHANGE = "webchat.messages";
const ROUTING_KEY = "message.persist";
const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_ATTEMPTS = 10;

let _channel = null;
let _connection = null;
let _reconnectAttempts = 0;
let _connecting = false;

/**
 * Connect to RabbitMQ and set up the exchange + channel.
 * Called once at startup; auto-reconnects on error.
 */
export async function initRabbitMQ(url) {
  if (!url) return false;
  if (_connecting) return false;
  _connecting = true;

  try {
    _connection = await amqplib.connect(url);
    _connection.on("error", (err) => {
      console.warn("[rabbitmq] Connection error:", err.message);
      scheduleReconnect(url);
    });
    _connection.on("close", () => {
      console.warn("[rabbitmq] Connection closed — reconnecting …");
      scheduleReconnect(url);
    });

    _channel = await _connection.createConfirmChannel();
    await _channel.assertExchange(EXCHANGE, "direct", { durable: true });
    _reconnectAttempts = 0;
    _connecting = false;
    console.log("[rabbitmq] Publisher connected to", url);
    return true;
  } catch (err) {
    _connecting = false;
    console.warn("[rabbitmq] Connect failed:", err.message);
    scheduleReconnect(url);
    return false;
  }
}

function scheduleReconnect(url) {
  _channel = null;
  _connection = null;
  if (_reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error("[rabbitmq] Max reconnect attempts reached. Giving up.");
    return;
  }
  _reconnectAttempts++;
  const delay = RECONNECT_DELAY_MS * _reconnectAttempts;
  console.log(`[rabbitmq] Reconnecting in ${delay}ms (attempt ${_reconnectAttempts}) …`);
  setTimeout(() => initRabbitMQ(url), delay);
}

/**
 * Publish a message-persist job to RabbitMQ.
 *
 * @param {Object} payload - { roomId, userId, username, content, message_type, file_url }
 * @returns {boolean} true if published, false if RabbitMQ is unavailable (caller should HTTP-fallback)
 */
export function publishMessage(payload) {
  if (!_channel) return false;
  try {
    const buf = Buffer.from(JSON.stringify(payload));
    _channel.publish(EXCHANGE, ROUTING_KEY, buf, {
      persistent: true,       // survive broker restart
      contentType: "application/json"
    });
    return true;
  } catch (err) {
    console.warn("[rabbitmq] Publish error:", err.message);
    return false;
  }
}

export function isRabbitMQReady() {
  return _channel !== null;
}
