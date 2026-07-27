import { jest } from "@jest/globals";
import { io as ioClient } from "socket.io-client";
import jwt from "jsonwebtoken";
import { createClient } from "redis";
import { createServerInstance } from "../src/server.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

describe("Chat Service Multi-Instance Scaling (Redis Pub/Sub)", () => {
  let serverA, serverB, portA, portB;
  let client1, client2;
  let pubA, subA, pubB, subB;

  const user1 = { id: "00000000-0000-0000-0000-000000000001", username: "alice", email: "alice@example.com" };
  const user2 = { id: "00000000-0000-0000-0000-000000000002", username: "bob", email: "bob@example.com" };
  const roomId = "22222222-2222-2222-2222-222222222222";

  let token1, token2;

  beforeAll(async () => {
    token1 = jwt.sign({ sub: user1.id, username: user1.username, email: user1.email }, JWT_SECRET);
    token2 = jwt.sign({ sub: user2.id, username: user2.username, email: user2.email }, JWT_SECRET);

    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: roomId }) })
    );

    // Setup Redis Pub/Sub clients for Server A
    pubA = createClient({ url: REDIS_URL });
    subA = pubA.duplicate();
    await Promise.all([pubA.connect(), subA.connect()]);

    // Setup Redis Pub/Sub clients for Server B
    pubB = createClient({ url: REDIS_URL });
    subB = pubB.duplicate();
    await Promise.all([pubB.connect(), subB.connect()]);

    // Spin up Socket.io Server Pod A
    const instanceA = createServerInstance({ pubClient: pubA, subClient: subA });
    serverA = instanceA.server;
    await new Promise((resolve) => serverA.listen(0, "127.0.0.1", resolve));
    portA = serverA.address().port;

    // Spin up Socket.io Server Pod B
    const instanceB = createServerInstance({ pubClient: pubB, subClient: subB });
    serverB = instanceB.server;
    await new Promise((resolve) => serverB.listen(0, "127.0.0.1", resolve));
    portB = serverB.address().port;
  });

  afterAll(async () => {
    if (client1?.connected) client1.disconnect();
    if (client2?.connected) client2.disconnect();

    await new Promise((resolve) => serverA.close(resolve));
    await new Promise((resolve) => serverB.close(resolve));

    await Promise.all([pubA.quit(), subA.quit(), pubB.quit(), subB.quit()]);
  });

  it("should sync messages across independent Chat pods via Redis Pub/Sub", (done) => {
    // Client 1 connects to Pod A
    client1 = ioClient(`http://127.0.0.1:${portA}`, {
      auth: { token: token1 },
      transports: ["websocket"],
    });

    // Client 2 connects to Pod B
    client2 = ioClient(`http://127.0.0.1:${portB}`, {
      auth: { token: token2 },
      transports: ["websocket"],
    });

    let client1Connected = false;
    let client2Connected = false;

    const onBothConnected = () => {
      if (!client1Connected || !client2Connected) return;

      // Client 1 (on Pod A) joins room
      client1.emit("join_room", { roomId }, (ack1) => {
        expect(ack1.ok).toBe(true);

        // Client 2 (on Pod B) joins room
        client2.emit("join_room", { roomId }, (ack2) => {
          expect(ack2.ok).toBe(true);

          // Client 2 (Pod B) listens for cross-instance message sent from Client 1 (Pod A)
          client2.once("receive_message", (msg) => {
            expect(msg.content).toBe("Cross-pod message via Redis adapter!");
            expect(msg.user_id).toBe(user1.id);
            expect(msg.username).toBe("alice");
            expect(msg.room_id).toBe(roomId);
            done();
          });

          // Client 1 sends message on Pod A
          client1.emit("send_message", { roomId, content: "Cross-pod message via Redis adapter!" });
        });
      });
    };

    client1.on("connect", () => {
      client1Connected = true;
      onBothConnected();
    });

    client2.on("connect", () => {
      client2Connected = true;
      onBothConnected();
    });
  });
});
