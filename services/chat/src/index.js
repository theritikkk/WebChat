import "./tracing.js"; // must be first — patches Node http/net before other imports
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createServerInstance } from "./server.js";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { initAuthRedis } from "./lib/auth.js";
import { initRabbitMQ } from "./lib/rabbitmq.js";
import { initPresence } from "./lib/presence.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const PORT = Number(process.env.PORT_CHAT) || 5000;
const CONFIRM_CHANNEL = "webchat:message:persisted";

const { app, server, io } = createServerInstance();

const redisUrl = process.env.REDIS_URL;
if (redisUrl) {
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();
  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log("[chat] Socket.io Redis adapter enabled");
    })
    .catch((err) => console.warn("[chat] Redis adapter disabled:", err.message));

  initAuthRedis(redisUrl);

  const presenceRedis = createClient({ url: redisUrl });
  presenceRedis.on("error", (err) => console.warn("[chat] Presence Redis error:", err.message));
  presenceRedis.connect()
    .then(async () => {
      initPresence(presenceRedis);
      console.log("[chat] Distributed presence enabled");

      const subClient = presenceRedis.duplicate();
      await subClient.connect();
      await subClient.subscribe(CONFIRM_CHANNEL, (raw) => {
        try {
          const { tempId, roomId, message } = JSON.parse(raw);
          if (!roomId || !message?._id) return;
          io.to(roomId).emit("message_confirmed", { tempId, message });
        } catch (err) {
          console.warn("[chat] message_confirmed parse error:", err.message);
        }
      });
      console.log("[chat] Message confirmation subscriber enabled");
    })
    .catch((err) => console.warn("[chat] Presence Redis unavailable:", err.message));
}

const rabbitUrl = process.env.RABBITMQ_URL;
if (rabbitUrl) {
  initRabbitMQ(rabbitUrl).then((ok) => {
    if (ok) console.log("[chat] RabbitMQ message queue enabled");
    else    console.warn("[chat] RabbitMQ unavailable — falling back to HTTP persist");
  });
}

server.listen(PORT, () => {
  console.log(`[chat] Socket.io service listening on ${PORT}`);
});
