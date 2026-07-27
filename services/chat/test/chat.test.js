import { jest } from "@jest/globals";
import { io as ioClient } from "socket.io-client";
import jwt from "jsonwebtoken";
import { createServerInstance } from "../src/server.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

describe("Chat Service Socket.io (Integration)", () => {
  let server, httpServer, port;
  let clientSocket1, clientSocket2;
  const user1 = { id: "00000000-0000-0000-0000-000000000001", username: "alice", email: "alice@example.com" };
  const user2 = { id: "00000000-0000-0000-0000-000000000002", username: "bob", email: "bob@example.com" };
  const roomId = "11111111-1111-1111-1111-111111111111";

  let token1, token2;

  beforeAll((done) => {
    token1 = jwt.sign({ sub: user1.id, username: user1.username, email: user1.email }, JWT_SECRET);
    token2 = jwt.sign({ sub: user2.id, username: user2.username, email: user2.email }, JWT_SECRET);

    // Mock fetch for room membership check in chat service
    global.fetch = jest.fn().mockImplementation((url, opts) => {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: roomId }) });
    });

    const instance = createServerInstance();
    httpServer = instance.server;
    httpServer.listen(0, () => {
      port = httpServer.address().port;
      done();
    });
  });

  afterAll((done) => {
    if (clientSocket1?.connected) clientSocket1.disconnect();
    if (clientSocket2?.connected) clientSocket2.disconnect();
    httpServer.close(done);
  });

  it("should authenticate socket connection with valid JWT", (done) => {
    clientSocket1 = ioClient(`http://127.0.0.1:${port}`, {
      auth: { token: token1 },
      transports: ["websocket"],
    });

    clientSocket1.on("connect", () => {
      expect(clientSocket1.connected).toBe(true);
      done();
    });
  });

  it("should fail authentication with invalid JWT token", (done) => {
    const invalidSocket = ioClient(`http://127.0.0.1:${port}`, {
      auth: { token: "invalid.jwt.token" },
      transports: ["websocket"],
    });

    invalidSocket.on("connect_error", (err) => {
      expect(err.message).toBe("Unauthorized");
      invalidSocket.disconnect();
      done();
    });
  });

  it("should allow user to join a room and notify room members", (done) => {
    clientSocket2 = ioClient(`http://127.0.0.1:${port}`, {
      auth: { token: token2 },
      transports: ["websocket"],
    });

    clientSocket2.on("connect", () => {
      // First client1 joins room
      clientSocket1.emit("join_room", { roomId }, (res1) => {
        expect(res1.ok).toBe(true);

        // Listen for client2 joining
        clientSocket1.once("user_joined", (data) => {
          expect(data.user_id).toBe(user2.id);
          expect(data.username).toBe("bob");
          done();
        });

        // client2 joins room
        clientSocket2.emit("join_room", { roomId }, (res2) => {
          expect(res2.ok).toBe(true);
        });
      });
    });
  });

  it("should broadcast sent message to room members in real-time", (done) => {
    const testContent = "Hello from Bob over Socket.io!";

    clientSocket1.once("receive_message", (msg) => {
      expect(msg.content).toBe(testContent);
      expect(msg.user_id).toBe(user2.id);
      expect(msg.username).toBe("bob");
      expect(msg.room_id).toBe(roomId);
      done();
    });

    clientSocket2.emit("send_message", { roomId, content: testContent }, (ack) => {
      expect(ack.ok).toBe(true);
    });
  });

  it("should emit user_offline when socket disconnects", (done) => {
    clientSocket1.once("user_offline", (data) => {
      expect(data.user_id).toBe(user2.id);
      done();
    });

    clientSocket2.disconnect();
  });
});
