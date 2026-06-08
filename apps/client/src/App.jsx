import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const API_BASE = import.meta.env.VITE_API_BASE;
const CHAT_URL  = import.meta.env.VITE_CHAT_URL;
const STUN = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// ─── Tiny status-icon helper ──────────────────────────────────────────────────
function StatusIcon({ status }) {
  if (status === "read")      return <span className="tick tick-read" title="Read">✓✓</span>;
  if (status === "delivered") return <span className="tick tick-delivered" title="Delivered">✓✓</span>;
  return <span className="tick" title="Sent">✓</span>;
}

// ─── WebRTC Video Call Component ──────────────────────────────────────────────
function VideoCall({ socket, roomId, userId, onClose }) {
  const localRef  = useRef(null);
  const remoteRef = useRef(null);
  const pcRef     = useRef(null);
  const [callState, setCallState] = useState("idle"); // idle | calling | connected | incoming
  const [incomingOffer, setIncomingOffer] = useState(null);
  const callIdRef = useRef(`call-${Date.now()}`);

  const getLocalStream = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (localRef.current) localRef.current.srcObject = stream;
    return stream;
  };

  const createPeerConnection = (stream) => {
    const pc = new RTCPeerConnection(STUN);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => {
      if (remoteRef.current) remoteRef.current.srcObject = e.streams[0];
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("call_ice_candidate", {
          callId: callIdRef.current, roomId, candidate: e.candidate
        });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setCallState("connected");
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) hangup();
    };
    pcRef.current = pc;
    return pc;
  };

  const startCall = async () => {
    setCallState("calling");
    const stream = await getLocalStream();
    const pc     = createPeerConnection(stream);
    const offer  = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("call_offer", { callId: callIdRef.current, roomId, offer });
  };

  const answerCall = async () => {
    const { offer, callId } = incomingOffer;
    callIdRef.current = callId;
    setCallState("connected");
    const stream = await getLocalStream();
    const pc     = createPeerConnection(stream);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("call_answer", { callId, roomId, answer });
  };

  const hangup = () => {
    pcRef.current?.close();
    pcRef.current = null;
    if (localRef.current?.srcObject) {
      localRef.current.srcObject.getTracks().forEach((t) => t.stop());
    }
    socket.emit("call_end", { callId: callIdRef.current, roomId });
    setCallState("idle");
    onClose();
  };

  useEffect(() => {
    if (!socket) return;
    const onOffer = (data) => {
      setIncomingOffer(data);
      setCallState("incoming");
    };
    const onAnswer = async (data) => {
      await pcRef.current?.setRemoteDescription(new RTCSessionDescription(data.answer));
    };
    const onIce = async (data) => {
      try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch {}
    };
    const onEnd = () => hangup();
    socket.on("call_offer", onOffer);
    socket.on("call_answer", onAnswer);
    socket.on("call_ice_candidate", onIce);
    socket.on("call_end", onEnd);
    return () => {
      socket.off("call_offer", onOffer);
      socket.off("call_answer", onAnswer);
      socket.off("call_ice_candidate", onIce);
      socket.off("call_end", onEnd);
    };
  }, [socket]);

  return (
    <div className="video-overlay">
      <div className="video-modal">
        <div className="video-header">
          <span>📹 Video Call</span>
          <span className={`call-state call-state--${callState}`}>
            {callState === "calling" ? "Calling…" : callState === "connected" ? "● Live" : callState === "incoming" ? "Incoming call" : "Ready"}
          </span>
        </div>
        <div className="video-grid">
          <div className="video-box">
            <video ref={localRef} autoPlay muted playsInline />
            <span className="video-label">You</span>
          </div>
          <div className="video-box">
            <video ref={remoteRef} autoPlay playsInline />
            <span className="video-label">Remote</span>
          </div>
        </div>
        <div className="video-controls">
          {callState === "idle"     && <button className="btn-call" onClick={startCall}>📞 Call Room</button>}
          {callState === "calling"  && <button className="btn-end"  onClick={hangup}>✕ Cancel</button>}
          {callState === "connected"&& <button className="btn-end"  onClick={hangup}>📵 End Call</button>}
          {callState === "incoming" && (
            <>
              <button className="btn-call" onClick={answerCall}>✔ Answer</button>
              <button className="btn-end"  onClick={hangup}>✕ Decline</button>
            </>
          )}
          {callState !== "incoming" && <button className="btn-secondary" onClick={onClose}>Close</button>}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [email,    setEmail]    = useState("demo@example.com");
  const [password, setPassword] = useState("password12");
  const [username, setUsername] = useState("demo");
  const [token,    setToken]    = useState(localStorage.getItem("accessToken") || "");
  const [roomId,   setRoomId]   = useState(localStorage.getItem("roomId") || "");
  const [messages, setMessages] = useState([]);
  const [msgStatus, setMsgStatus] = useState({}); // messageId → "sent"|"delivered"|"read"
  const [draft,    setDraft]    = useState("");
  const [status,   setStatus]   = useState("");
  const [socket,   setSocket]   = useState(null);
  const [showVideo, setShowVideo] = useState(false);
  const [searchQ,  setSearchQ]  = useState("");
  const [searching, setSearching] = useState(false);
  const messagesEndRef = useRef(null);
  const observerRef    = useRef(null);

  const authed   = Boolean(token);
  const myUserId = useRef(null);

  // Decode userId from token on mount / token change
  useEffect(() => {
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      myUserId.current = payload.sub;
    } catch {}
  }, [token]);

  // ── Load message history ─────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!token || !roomId) return;
    const r = await fetch(`${API_BASE}/api/v1/rooms/${roomId}/messages?limit=50`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) { setStatus(`History failed: ${r.status}`); return; }
    const data = await r.json();
    setMessages(data.messages || []);
  }, [token, roomId]);

  // ── Search messages ──────────────────────────────────────────────────────
  const searchMessages = useCallback(async () => {
    if (!token || !roomId || !searchQ.trim()) return;
    setSearching(true);
    const r = await fetch(
      `${API_BASE}/api/v1/rooms/${roomId}/messages?q=${encodeURIComponent(searchQ)}&limit=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setSearching(false);
    if (!r.ok) { setStatus(`Search failed: ${r.status}`); return; }
    const data = await r.json();
    setMessages(data.messages || []);
    setStatus(`Search via ${data.source || "backend"} — ${data.messages?.length || 0} results`);
  }, [token, roomId, searchQ]);

  // ── Socket connection ────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const s = io(CHAT_URL, { auth: { token }, transports: ["websocket", "polling"] });
    s.on("connect",       () => setStatus(`Connected (${s.id})`));
    s.on("connect_error", (e) => setStatus(`Error: ${e.message}`));

    s.on("receive_message", (msg) => {
      setMessages((m) => [...m, msg]);
      // Immediately emit delivery ACK
      s.emit("message_ack", { messageId: msg._id, roomId: msg.room_id });
    });

    s.on("message_status", ({ message_id, status: st }) => {
      setMsgStatus((prev) => ({ ...prev, [message_id]: st }));
    });

    s.on("user_typing", (evt) => {
      if (evt.typing) setStatus(`${evt.username} is typing…`);
    });

    setSocket(s);
    return () => s.close();
  }, [token]);

  // ── Auto-join room ───────────────────────────────────────────────────────
  useEffect(() => {
    if (socket && roomId && authed) {
      socket.emit("join_room", { roomId }, (ack) => {
        if (ack?.error) setStatus(ack.error);
        else { setStatus("Joined room ✓"); loadHistory(); }
      });
    }
  }, [socket, roomId, authed, loadHistory]);

  // ── IntersectionObserver for read receipts ────────────────────────────────
  useEffect(() => {
    if (!socket || !roomId) return;
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const msgId  = entry.target.dataset.msgId;
          const senderId = entry.target.dataset.senderId;
          if (msgId && senderId !== myUserId.current) {
            socket.emit("mark_read", { messageId: msgId, roomId });
            observerRef.current?.unobserve(entry.target);
          }
        }
      });
    }, { threshold: 0.8 });
    return () => observerRef.current?.disconnect();
  }, [socket, roomId]);

  // Observe new message elements
  useEffect(() => {
    const nodes = document.querySelectorAll(".msg[data-msg-id]");
    nodes.forEach((n) => observerRef.current?.observe(n));
  }, [messages]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Auth actions ─────────────────────────────────────────────────────────
  async function register() {
    setStatus("…");
    const r = await fetch(`${API_BASE}/v1/auth/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { setStatus(data.error || JSON.stringify(data.errors || data)); return; }
    setToken(data.accessToken);
    localStorage.setItem("accessToken", data.accessToken);
    setStatus("Registered & signed in ✓");
  }

  async function login() {
    setStatus("…");
    const r = await fetch(`${API_BASE}/v1/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { setStatus(data.error || "Login failed"); return; }
    setToken(data.accessToken);
    localStorage.setItem("accessToken", data.accessToken);
    setStatus("Logged in ✓");
  }

  function logout() {
    localStorage.removeItem("accessToken");
    setToken(""); setMessages([]); setStatus("Logged out");
  }

  async function createRoom() {
    const name = prompt("Room name?", "General");
    if (!name) return;
    const r = await fetch(`${API_BASE}/api/v1/rooms`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, room_type: "public" })
    });
    const data = await r.json();
    if (!r.ok) { setStatus(data.error || "Create failed"); return; }
    setRoomId(data.id);
    localStorage.setItem("roomId", data.id);
    setStatus(`Room created: ${data.id}`);
  }

  // ── Send message ─────────────────────────────────────────────────────────
  function send() {
    if (!socket || !roomId || !draft.trim()) return;
    socket.emit("send_message", { roomId, content: draft.trim(), message_type: "text" }, (ack) => {
      if (ack?.error) setStatus(ack.error);
    });
    setDraft("");
  }

  const typingTimer = useRef(null);
  function onDraftChange(v) {
    setDraft(v);
    if (!socket || !roomId) return;
    socket.emit("typing_start", { roomId });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket.emit("typing_stop", { roomId }), 800);
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <h1>💬 WebChat</h1>
      <p className="subtitle">Gateway: {API_BASE} · Chat: {CHAT_URL}</p>

      {!authed ? (
        <div className="panel">
          <label>Email</label>
          <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Username <span className="hint">(register only)</span></label>
          <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <label>Password <span className="hint">(min 8 chars)</span></label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="row">
            <button id="btn-register" onClick={register}>Register</button>
            <button id="btn-login"    onClick={login} className="secondary">Login</button>
          </div>
        </div>
      ) : (
        <>
          {/* ── Toolbar ── */}
          <div className="panel row toolbar">
            <button id="btn-logout"      className="secondary" onClick={logout}>Log out</button>
            <button id="btn-create-room" onClick={createRoom}>＋ Room</button>
            {roomId && (
              <button id="btn-video" className="btn-video" onClick={() => setShowVideo(true)}>📹 Video</button>
            )}
          </div>

          {/* ── Room ID ── */}
          <div className="panel row">
            <input
              id="room-id-input"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Paste room UUID…"
              style={{ flex: 1 }}
            />
            <button id="btn-save-room" className="secondary" onClick={() => localStorage.setItem("roomId", roomId)}>
              Save
            </button>
          </div>

          {/* ── Search ── */}
          <div className="panel row">
            <input
              id="search-input"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchMessages()}
              placeholder="🔍 Search messages (Elasticsearch)…"
              style={{ flex: 1 }}
            />
            <button id="btn-search" className="secondary" onClick={searchMessages} disabled={searching}>
              {searching ? "…" : "Search"}
            </button>
            {searchQ && (
              <button className="secondary" onClick={() => { setSearchQ(""); loadHistory(); }}>✕</button>
            )}
          </div>

          {/* ── Messages ── */}
          <div className="panel messages" id="messages-panel">
            {messages.map((m) => {
              const isOwn = m.user_id === myUserId.current;
              const st    = msgStatus[m._id] || m.status || "sent";
              return (
                <div
                  key={m._id}
                  className={`msg ${isOwn ? "msg-own" : "msg-other"}`}
                  data-msg-id={m._id}
                  data-sender-id={m.user_id}
                >
                  <span className="who">{m.username || m.user_id}</span>
                  <span className="content">{m.content}</span>
                  {isOwn && <StatusIcon status={st} />}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Compose ── */}
          <div className="panel row">
            <input
              id="message-input"
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Type a message…"
              style={{ flex: 1 }}
            />
            <button id="btn-send" onClick={send} disabled={!roomId}>Send</button>
          </div>
        </>
      )}

      <p className="status" id="status-bar">{status}</p>

      {/* ── WebRTC Video Call overlay ── */}
      {showVideo && socket && (
        <VideoCall
          socket={socket}
          roomId={roomId}
          userId={myUserId.current}
          onClose={() => setShowVideo(false)}
        />
      )}
    </div>
  );
}
