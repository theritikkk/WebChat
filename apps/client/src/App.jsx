import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:4000";
const CHAT_URL = import.meta.env.VITE_CHAT_URL || "http://127.0.0.1:5000";

export default function App() {
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("password12");
  const [username, setUsername] = useState("demo");
  const [token, setToken] = useState(localStorage.getItem("accessToken") || "");
  const [roomId, setRoomId] = useState(localStorage.getItem("roomId") || "");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [socket, setSocket] = useState(null);

  const authed = Boolean(token);

  const loadHistory = useCallback(async () => {
    if (!token || !roomId) {
      return;
    }
    const r = await fetch(`${API_BASE}/api/v1/rooms/${roomId}/messages?limit=50`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) {
      setStatus(`History failed: ${r.status}`);
      return;
    }
    const data = await r.json();
    setMessages(data.messages || []);
  }, [token, roomId]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const s = io(CHAT_URL, {
      auth: { token },
      transports: ["websocket", "polling"]
    });
    s.on("connect", () => setStatus(`Chat connected (${s.id})`));
    s.on("connect_error", (err) => setStatus(`Chat error: ${err.message}`));
    s.on("receive_message", (msg) => {
      setMessages((m) => [...m, msg]);
    });
    s.on("user_typing", (evt) => {
      if (evt.typing) {
        setStatus(`${evt.username} is typing…`);
      }
    });
    setSocket(s);
    return () => s.close();
  }, [token]);

  useEffect(() => {
    if (socket && roomId && authed) {
      socket.emit("join_room", { roomId }, (ack) => {
        if (ack?.error) {
          setStatus(ack.error);
        } else {
          setStatus("Joined room");
          loadHistory();
        }
      });
    }
  }, [socket, roomId, authed, loadHistory]);

  async function register() {
    setStatus("…");
    const r = await fetch(`${API_BASE}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setStatus(data.error || JSON.stringify(data.errors || data));
      return;
    }
    setToken(data.accessToken);
    localStorage.setItem("accessToken", data.accessToken);
    setStatus("Registered & signed in");
  }

  async function login() {
    setStatus("…");
    const r = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setStatus(data.error || "Login failed");
      return;
    }
    setToken(data.accessToken);
    localStorage.setItem("accessToken", data.accessToken);
    setStatus("Logged in");
  }

  function logout() {
    localStorage.removeItem("accessToken");
    setToken("");
    setMessages([]);
    setStatus("Logged out");
  }

  async function createRoom() {
    const name = prompt("Room name?", "General");
    if (!name) {
      return;
    }
    const r = await fetch(`${API_BASE}/api/v1/rooms`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name, room_type: "public" })
    });
    const data = await r.json();
    if (!r.ok) {
      setStatus(data.error || "Create failed");
      return;
    }
    setRoomId(data.id);
    localStorage.setItem("roomId", data.id);
    setStatus(`Room created: ${data.id}`);
  }

  function send() {
    if (!socket || !roomId || !draft.trim()) {
      return;
    }
    socket.emit("send_message", { roomId, content: draft.trim(), message_type: "text" }, (ack) => {
      if (ack?.error) {
        setStatus(ack.error);
      }
    });
    setDraft("");
  }

  const typingMemo = useMemo(() => ({ t: null }), []);
  function onDraftChange(v) {
    setDraft(v);
    if (!socket || !roomId) {
      return;
    }
    socket.emit("typing_start", { roomId });
    clearTimeout(typingMemo.t);
    typingMemo.t = setTimeout(() => socket.emit("typing_stop", { roomId }), 800);
  }

  return (
    <div className="app">
      <h1>WebChat — microservices demo</h1>
      <p className="status">Gateway: {API_BASE} · Chat: {CHAT_URL}</p>

      {!authed ? (
        <div className="panel">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Username (register only)</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
          <label>Password (min 8 chars)</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="row">
            <button type="button" onClick={register}>
              Register
            </button>
            <button type="button" className="secondary" onClick={login}>
              Login
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="panel row">
            <button type="button" className="secondary" onClick={logout}>
              Log out
            </button>
            <button type="button" onClick={createRoom}>
              Create room
            </button>
          </div>
          <div className="panel">
            <label>Room ID</label>
            <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="UUID" />
            <button type="button" className="secondary" onClick={() => localStorage.setItem("roomId", roomId)}>
              Save room
            </button>
          </div>
          <div className="panel messages">
            {messages.map((m) => (
              <div key={m._id} className="msg">
                <span className="who">{m.username || m.user_id}</span>
                <span>{m.content}</span>
              </div>
            ))}
          </div>
          <div className="panel row">
            <input
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Message…"
            />
            <button type="button" onClick={send} disabled={!roomId}>
              Send
            </button>
          </div>
        </>
      )}
      <p className="status">{status}</p>
    </div>
  );
}
