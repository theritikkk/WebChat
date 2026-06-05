/**
 * k6 HTTP Load Test for WebChat API Gateway
 * Simulates 500 concurrent users performing rest actions: login, create room, list messages.
 *
 * k6 run scripts/loadtest/k6-http.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

const GATEWAY_URL = __ENV.GATEWAY_URL || "http://127.0.0.1:4000";

export const options = {
  stages: [
    { duration: "1m", target: 500 }, // ramp up to 500 VUs
    { duration: "3m", target: 500 }, // hold 500 VUs
    { duration: "1m", target: 0 }    // ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"] // p95 request duration under 500ms
  }
};

export default function () {
  const vuId = __VU;
  const username = `user_http_${vuId}_${Math.floor(Math.random() * 100000)}`;
  const email = `${username}@example.com`;
  const password = "password123";

  const headers = { "Content-Type": "application/json" };

  // 1. Register
  const registerPayload = JSON.stringify({ email, username, password });
  const regRes = http.post(`${GATEWAY_URL}/api/v1/auth/register`, registerPayload, { headers });
  
  const registered = check(regRes, {
    "register status 200 or 201": (r) => r.status === 200 || r.status === 201
  });

  if (!registered) {
    sleep(1);
    return;
  }

  // 2. Login
  const loginPayload = JSON.stringify({ email, password });
  const loginRes = http.post(`${GATEWAY_URL}/api/v1/auth/login`, loginPayload, { headers });
  
  const loggedIn = check(loginRes, {
    "login status 200": (r) => r.status === 200
  });

  if (!loggedIn) {
    sleep(1);
    return;
  }

  const token = loginRes.json("accessToken");
  const authHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };

  // 3. Create a room
  const roomPayload = JSON.stringify({ name: `Room of VU ${vuId}`, room_type: "public" });
  const roomRes = http.post(`${GATEWAY_URL}/api/v1/rooms`, roomPayload, { headers: authHeaders });
  
  const roomCreated = check(roomRes, {
    "create room status 200 or 201": (r) => r.status === 200 || r.status === 201
  });

  if (!roomCreated) {
    sleep(1);
    return;
  }

  const roomId = roomRes.json("id");

  // 4. Fetch messages from the room (should be empty initially, but registers route lookup/caching)
  const messagesRes = http.get(`${GATEWAY_URL}/api/v1/rooms/${roomId}/messages?limit=50`, { headers: authHeaders });
  check(messagesRes, {
    "get messages status 200": (r) => r.status === 200
  });

  sleep(Math.random() * 3 + 1); // wait 1-4 seconds before repeating
}
