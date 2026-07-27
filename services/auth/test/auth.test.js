/**
 * Auth & Room Services Integration Tests
 *
 * DB Strategy & Trade-offs: Uses Sequelize with `sqlite::memory:` as an acceptable trade-off for
 * sub-second, zero-dependency isolated CRUD test execution in local development and CI pipelines.
 * Production uses PostgreSQL for row-level locking, strict FK enforcement, and migration execution.
 */
import { jest } from "@jest/globals";
import request from "supertest";
import { app } from "../src/app.js";
import { sequelize } from "../src/db.js";
import { User, Room, RoomMember } from "../src/models/index.js";

describe("Auth & Room Services (Integration)", () => {
  let token1, token2, user1, user2, roomId;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe("POST /api/v1/auth/register", () => {
    it("should register a new user successfully", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: "alice@example.com",
          username: "alice",
          password: "password123",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
      expect(res.body.user).toMatchObject({
        email: "alice@example.com",
        username: "alice",
      });

      token1 = res.body.accessToken;
      user1 = res.body.user;
    });

    it("should reject registration with invalid email or short password", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: "invalid-email",
          username: "al",
          password: "123",
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("errors");
    });

    it("should return 409 when registering duplicate email or username", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: "alice@example.com",
          username: "alice_new",
          password: "password123",
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/email already registered/i);
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("should register a second user for testing", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: "bob@example.com",
          username: "bob",
          password: "password123",
        });

      expect(res.status).toBe(201);
      token2 = res.body.accessToken;
      user2 = res.body.user;
    });

    it("should authenticate valid user and return tokens", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "alice@example.com",
          password: "password123",
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body.user.username).toBe("alice");
    });

    it("should reject login with wrong password", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "alice@example.com",
          password: "wrongpassword",
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid credentials/i);
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("should return current user info with valid JWT", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token1}`);

      expect(res.status).toBe(200);
      expect(res.body.username).toBe("alice");
      expect(res.body.email).toBe("alice@example.com");
    });

    it("should reject request without Bearer token", async () => {
      const res = await request(app).get("/api/v1/auth/me");
      expect(res.status).toBe(401);
    });
  });

  describe("Rooms API (/api/v1/rooms)", () => {
    it("should create a new public room", async () => {
      const res = await request(app)
        .post("/api/v1/rooms")
        .set("Authorization", `Bearer ${token1}`)
        .send({ name: "General Chat", room_type: "public" });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.name).toBe("General Chat");
      roomId = res.body.id;
    });

    it("should allow second user to join the public room", async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set("Authorization", `Bearer ${token2}`);

      expect([200, 201]).toContain(res.status);
      expect(res.body.user_id).toBe(user2.id);
    });

    it("should return list of room members", async () => {
      const res = await request(app)
        .get(`/api/v1/rooms/${roomId}/members`)
        .set("Authorization", `Bearer ${token1}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });
  });
});
