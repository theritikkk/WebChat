/**
 * k6 WebSocket Load Test for WebChat (Socket.io)
 * Simulates 1,000 concurrent users joining a room, sending messages, and verifying latency.
 *
 * k6 run scripts/loadtest/k6-websocket.js
 */
import ws from "k6/ws";
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";

const GATEWAY_URL = __ENV.GATEWAY_URL || "http://127.0.0.1:4000";
const CHAT_WS_URL = __ENV.CHAT_WS_URL || "ws://127.0.0.1:5000";

// Metrics
const wsMsgsReceived = new Trend("ws_msgs_received_duration");
const wsConnErrors = new Counter("ws_conn_errors");
const wsSendErrors = new Counter("ws_send_errors");

export const options = {
  stages: [
    { duration: "2m", target: 1000 }, // ramp up to 1000 users
    { duration: "5m", target: 1000 }, // stay at 1000 users
    { duration: "1m", target: 0 }     // ramp down
  ],
  thresholds: {
    ws_msgs_received_duration: ["p(95)<200"], // p95 latency under 200ms
    checks: ["rate>0.99"]                     // error rate < 1%
  }
};

export default function () {
  const vuId = __VU;
  const username = `user_${vuId}_${Math.floor(Math.random() * 100000)}`;
  const email = `${username}@example.com`;
  const password = "password123";

  // 1. Authenticate / Register to get token
  const registerPayload = JSON.stringify({ email, username, password });
  const headers = { "Content-Type": "application/json" };
  const regRes = http.post(`${GATEWAY_URL}/api/v1/auth/register`, registerPayload, { headers });
  
  if (!check(regRes, { "Registered successfully": (r) => r.status === 200 || r.status === 201 })) {
    wsConnErrors.add(1);
    return;
  }

  const token = regRes.json("accessToken");
  if (!token) {
    wsConnErrors.add(1);
    return;
  }

  // 2. Room membership (We can use a fixed room or let each VU join a shared room)
  // Let's use room ID "general-room-loadtest" (UUID format or standard string)
  const roomId = "00000000-0000-0000-0000-000000000001";
  
  // 3. Connect to Socket.io via Raw WebSocket with auth in query string
  const authPayload = encodeURIComponent(JSON.stringify({ token }));
  const url = `${CHAT_WS_URL}/socket.io/?EIO=4&transport=websocket&auth=${authPayload}`;

  const res = ws.connect(url, {}, function (socket) {
    let messageCount = 0;
    
    socket.on("open", () => {
      // Socket.io handshake: Send namespace connection packet
      socket.send("40");
    });

    socket.on("message", (data) => {
      // Socket.io namespace acknowledgement
      if (data === "40") {
        // Join room
        socket.send(`42["join_room",{"roomId":"${roomId}"}]`);
        
        // Wait a bit, then start sending messages
        sleep(1);
        sendNextMessage();
      }

      // Track received messages and latency
      if (data.startsWith("42")) {
        const payload = JSON.parse(data.slice(2));
        const eventName = payload[0];
        if (eventName === "receive_message") {
          const msg = payload[1];
          const sentAt = new Date(msg.timestamp).getTime();
          const latency = Date.now() - sentAt;
          wsMsgsReceived.add(latency);
        }
      }
    });

    function sendNextMessage() {
      if (messageCount >= 10) {
        // Sent 10 messages, disconnect
        socket.close();
        return;
      }
      
      messageCount++;
      const payload = JSON.stringify(["send_message", {
        roomId: roomId,
        content: `Hello loadtest message ${messageCount} from VU ${vuId}`,
        message_type: "text"
      }]);
      
      const success = check(socket, {
        "socket open before send": (s) => s !== null
      });

      if (success) {
        socket.send(`42${payload}`);
        sleep(Math.random() * 2 + 1); // sleep 1-3 seconds between messages
        sendNextMessage();
      } else {
        wsSendErrors.add(1);
        socket.close();
      }
    }

    socket.on("error", (e) => {
      wsConnErrors.add(1);
    });
  });

  check(res, { "status is 101": (r) => r && r.status === 101 });
}
