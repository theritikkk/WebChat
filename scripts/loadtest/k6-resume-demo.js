/**
 * Resume demo load test — 300+ concurrent users
 * HTTP: register, login, create room, read messages
 * WebSocket: real-time messaging via Socket.io (auth in CONNECT packet)
 *
 * GATEWAY_URL=http://YOUR_LB CHAT_WS_URL=ws://YOUR_LB k6 run scripts/loadtest/k6-resume-demo.js
 */
import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";

const GATEWAY = __ENV.GATEWAY_URL || "http://127.0.0.1:4000";
const WS_BASE = __ENV.CHAT_WS_URL || "ws://127.0.0.1:5000";

export const options = {
  scenarios: {
    http_users: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 200 },
        { duration: "2m", target: 200 },
        { duration: "30s", target: 0 },
      ],
      exec: "httpFlow",
    },
    realtime_users: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 100 },
        { duration: "2m", target: 100 },
        { duration: "30s", target: 0 },
      ],
      exec: "wsFlow",
      startTime: "15s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<800"],
    checks: ["rate>0.9"],
  },
};

function registerAndLogin(prefix) {
  const id = `${prefix}_${__VU}_${__ITER}`;
  const email = `${id}@loadtest.demo`;
  const username = id;
  const password = "LoadTest123!";
  const headers = { "Content-Type": "application/json" };

  let res = http.post(
    `${GATEWAY}/api/v1/auth/register`,
    JSON.stringify({ email, username, password }),
    { headers }
  );
  if (res.status !== 201 && res.status !== 200) {
    res = http.post(
      `${GATEWAY}/api/v1/auth/login`,
      JSON.stringify({ email, password }),
      { headers }
    );
  }
  if (res.status !== 200 && res.status !== 201) return null;
  return res.json("accessToken");
}

export function httpFlow() {
  const token = registerAndLogin("http");
  if (!token) { sleep(1); return; }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const roomRes = http.post(
    `${GATEWAY}/api/v1/rooms`,
    JSON.stringify({ name: `Room ${__VU}`, room_type: "public" }),
    { headers }
  );
  check(roomRes, { "room created": (r) => r.status === 200 || r.status === 201 });

  if (roomRes.status === 200 || roomRes.status === 201) {
    const roomId = roomRes.json("id");
    const msgRes = http.get(`${GATEWAY}/api/v1/rooms/${roomId}/messages?limit=20`, { headers });
    check(msgRes, { "messages ok": (r) => r.status === 200 });
  }
  sleep(Math.random() * 2 + 1);
}

export function wsFlow() {
  const token = registerAndLogin("ws");
  if (!token) { sleep(1); return; }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const roomRes = http.post(
    `${GATEWAY}/api/v1/rooms`,
    JSON.stringify({ name: `WS Room ${__VU}`, room_type: "public" }),
    { headers }
  );
  if (roomRes.status !== 200 && roomRes.status !== 201) { sleep(1); return; }
  const roomId = roomRes.json("id");

  const url = `${WS_BASE}/socket.io/?EIO=4&transport=websocket`;
  const res = ws.connect(url, {}, (socket) => {
    socket.on("open", () => {});
    socket.on("message", (raw) => {
      const data = String(raw);
      // Engine.IO open packet
      if (data.startsWith("0")) {
        socket.send(`40${JSON.stringify({ token })}`);
      }
      // Namespace connected
      if (data === "40" || data.startsWith("40{")) {
        socket.send(`42${JSON.stringify(["join_room", { roomId }])}`);
        sleep(0.5);
        for (let i = 0; i < 3; i++) {
          socket.send(`42${JSON.stringify([
            "send_message",
            { roomId, content: `Load msg ${__VU}-${i}`, message_type: "text" },
          ])}`);
          sleep(0.3);
        }
        sleep(2);
        socket.close();
      }
    });
    socket.setTimeout(() => socket.close(), 15000);
  });

  check(res, { "ws connected": (r) => r && r.status === 101 });
  sleep(1);
}
