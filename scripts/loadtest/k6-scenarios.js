/**
 * Combined k6 Scenarios Load Test for WebChat
 * Simulates a complex production-like load with 70% readers, 20% writers, and 10% video call signalers.
 *
 * k6 run scripts/loadtest/k6-scenarios.js
 */
import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";

const GATEWAY_URL = __ENV.GATEWAY_URL || "http://127.0.0.1:4000";
const CHAT_WS_URL = __ENV.CHAT_WS_URL || "ws://127.0.0.1:5000";
const SHARED_ROOM_ID = "00000000-0000-0000-0000-000000000001";

export const options = {
  scenarios: {
    // 70% Readers (Total 350 active users)
    readers: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 350 },
        { duration: "3m", target: 350 },
        { duration: "1m", target: 0 }
      ],
      gracefulRampDown: "30s",
      exec: "readerScenario"
    },
    // 20% Writers (Total 100 active users)
    writers: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 100 },
        { duration: "3m", target: 100 },
        { duration: "1m", target: 0 }
      ],
      gracefulRampDown: "30s",
      exec: "writerScenario"
    },
    // 10% Video Call Signalers (Total 50 active users)
    video_signalers: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 50 },
        { duration: "3m", target: 50 },
        { duration: "1m", target: 0 }
      ],
      gracefulRampDown: "30s",
      exec: "videoSignalerScenario"
    }
  },
  thresholds: {
    http_req_duration: ["p(95)<500"],
    "ws_connecting{scenario:video_signalers}": ["p(95)<1000"]
  }
};

// Helper: Get a token and join a room
function authenticateAndGetToken(vuId, prefix) {
  const username = `${prefix}_user_${vuId}_${Math.floor(Math.random() * 100000)}`;
  const email = `${username}@example.com`;
  const password = "password123";
  const headers = { "Content-Type": "application/json" };

  const regRes = http.post(`${GATEWAY_URL}/api/v1/auth/register`, JSON.stringify({ email, username, password }), { headers });
  if (regRes.status !== 200 && regRes.status !== 201) return null;
  return regRes.json("accessToken");
}

// 1. Reader Scenario: Reads chat history and searches using Elasticsearch
export function readerScenario() {
  const token = authenticateAndGetToken(__VU, "reader");
  if (!token) return sleep(1);

  const authHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };

  // Perform continuous history reads and searches
  for (let i = 0; i < 5; i++) {
    // Read history
    const historyRes = http.get(`${GATEWAY_URL}/api/v1/rooms/${SHARED_ROOM_ID}/messages?limit=20`, { headers: authHeaders });
    check(historyRes, { "read history success": (r) => r.status === 200 });

    // Perform keyword search (triggers ES search)
    const searchRes = http.get(`${GATEWAY_URL}/api/v1/rooms/${SHARED_ROOM_ID}/messages?q=hello&limit=10`, { headers: authHeaders });
    check(searchRes, { "es search success": (r) => r.status === 200 });

    sleep(Math.random() * 5 + 2);
  }
}

// 2. Writer Scenario: Emits messages and processes status receipts (acks/reads)
export function writerScenario() {
  const token = authenticateAndGetToken(__VU, "writer");
  if (!token) return sleep(1);

  const authPayload = encodeURIComponent(JSON.stringify({ token }));
  const url = `${CHAT_WS_URL}/socket.io/?EIO=4&transport=websocket&auth=${authPayload}`;

  ws.connect(url, {}, function (socket) {
    socket.on("open", () => {
      socket.send("40");
    });

    socket.on("message", (data) => {
      if (data === "40") {
        socket.send(`42["join_room",{"roomId":"${SHARED_ROOM_ID}"}]`);
        sleep(1);
        sendMessageCycle(socket);
      }
    });

    function sendMessageCycle(s) {
      const payload = JSON.stringify(["send_message", {
        roomId: SHARED_ROOM_ID,
        content: `Writer load message from VU ${__VU}`,
        message_type: "text"
      }]);
      s.send(`42${payload}`);
      
      sleep(Math.random() * 4 + 2);
      sendMessageCycle(s);
    }
  });
}

// 3. Video Call Signaler Scenario: Simulates WebRTC signaling exchange
export function videoSignalerScenario() {
  const token = authenticateAndGetToken(__VU, "video");
  if (!token) return sleep(1);

  const authPayload = encodeURIComponent(JSON.stringify({ token }));
  const url = `${CHAT_WS_URL}/socket.io/?EIO=4&transport=websocket&auth=${authPayload}`;

  ws.connect(url, {}, function (socket) {
    socket.on("open", () => {
      socket.send("40");
    });

    socket.on("message", (data) => {
      if (data === "40") {
        socket.send(`42["join_room",{"roomId":"${SHARED_ROOM_ID}"}]`);
        sleep(1);
        sendWebRTCSignals(socket);
      }
    });

    function sendWebRTCSignals(s) {
      const callId = `call-${__VU}-${Date.now()}`;
      const targetUserId = `target-${__VU}`;

      // Emit call offer
      s.send(`42${JSON.stringify(["call_offer", { callId, roomId: SHARED_ROOM_ID, targetUserId, offer: { type: "offer", sdp: "dummy-sdp-data" } }])}`);
      sleep(1);

      // Emit ICE candidates
      s.send(`42${JSON.stringify(["call_ice_candidate", { callId, roomId: SHARED_ROOM_ID, targetUserId, candidate: { candidate: "candidate:1 1 UDP 1 127.0.0.1 3478 typ host", sdpMid: "0", sdpMLineIndex: 0 } }])}`);
      sleep(1);

      // End call
      s.send(`42${JSON.stringify(["call_end", { callId, roomId: SHARED_ROOM_ID, targetUserId }])}`);
      
      sleep(Math.random() * 10 + 5);
      sendWebRTCSignals(s);
    }
  });
}
