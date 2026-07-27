import { jest } from "@jest/globals";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { app } from "../src/app.js";
import { Message } from "../src/models/Message.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../../../.env") });

describe("Messages Service (Integration)", () => {
  let mongoServer;
  let token1, token2;
  const userId1 = "00000000-0000-0000-0000-000000000001";
  const userId2 = "00000000-0000-0000-0000-000000000002";
  const roomId = "11111111-1111-1111-1111-111111111111";

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    const secret = process.env.JWT_SECRET || "dev-secret-change-me";
    token1 = jwt.sign({ sub: userId1, email: "alice@example.com", username: "alice" }, secret);
    token2 = jwt.sign({ sub: userId2, email: "bob@example.com", username: "bob" }, secret);

    global.fetch = jest.fn().mockImplementation((url, opts) => {
      const authHeader = opts?.headers?.Authorization || "";
      if (authHeader.includes(token1) || authHeader.includes(token2)) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: roomId }) });
      }
      return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ error: "Forbidden" }) });
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe("POST /api/v1/rooms/:roomId/messages", () => {
    it("should create a message with HTML sanitization", async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${roomId}/messages`)
        .set("Authorization", `Bearer ${token1}`)
        .send({
          content: "Hello <script>alert('xss')</script>World!",
          message_type: "text",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("_id");
      expect(res.body.content).toBe("Hello World!");
      expect(res.body.username).toBe("alice");
      expect(res.body.user_id).toBe(userId1);
    });

    it("should reject message creation for unauthenticated request", async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${roomId}/messages`)
        .send({ content: "Unauthorized message" });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/v1/rooms/:roomId/messages", () => {
    it("should fetch paginated message history for room", async () => {
      await request(app)
        .post(`/api/v1/rooms/${roomId}/messages`)
        .set("Authorization", `Bearer ${token2}`)
        .send({ content: "Second message from Bob" });

      const res = await request(app)
        .get(`/api/v1/rooms/${roomId}/messages`)
        .set("Authorization", `Bearer ${token1}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("messages");
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(res.body.messages.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("PATCH & DELETE /api/v1/rooms/:roomId/messages/:messageId", () => {
    let createdMsgId;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${roomId}/messages`)
        .set("Authorization", `Bearer ${token1}`)
        .send({ content: "Original content to edit" });
      createdMsgId = res.body._id;
    });

    it("should allow author to edit message content", async () => {
      const res = await request(app)
        .patch(`/api/v1/rooms/${roomId}/messages/${createdMsgId}`)
        .set("Authorization", `Bearer ${token1}`)
        .send({ content: "Updated content by Alice" });

      expect(res.status).toBe(200);
      expect(res.body.content).toBe("Updated content by Alice");
      expect(res.body.edited).toBe(true);
    });

    it("should soft delete message when author deletes it", async () => {
      const res = await request(app)
        .delete(`/api/v1/rooms/${roomId}/messages/${createdMsgId}`)
        .set("Authorization", `Bearer ${token1}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const dbMsg = await Message.findById(createdMsgId);
      expect(dbMsg.deleted).toBe(true);
      expect(dbMsg.content).toBe("");
    });
  });
});
