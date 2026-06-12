import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./styles.css";
import AuthScreen from "./components/AuthScreen";
import Sidebar from "./components/Sidebar";
import ChatArea from "./components/ChatArea";
import VideoCall from "./components/VideoCall";
import CreateRoomModal from "./components/CreateRoomModal";
import JoinRoomModal from "./components/JoinRoomModal";
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastProvider, useToast } from "./context/ToastContext";
import { CHAT_URL } from "./services/config";
import {
  logout,
  createRoom,
  fetchMessages,
  fetchOnlineUsers,
  fetchRooms,
  getAccessToken,
  joinRoom,
  login,
  register,
  uploadFile,
} from "./services/api";
import { isTempId, normalizeMessage } from "./utils/message";

function ChatApp() {
  const { toast } = useToast();

  const [token, setToken] = useState(getAccessToken());
  const [username, setUsername] = useState("");
  const [userId, setUserId] = useState(null);

  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState(localStorage.getItem("roomId") || "");
  const [loadingRooms, setLoadingRooms] = useState(false);

  const [messages, setMessages] = useState([]);
  const [msgStatus, setMsgStatus] = useState({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [typingUser, setTypingUser] = useState("");
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [unread, setUnread] = useState({});

  const [showVideo, setShowVideo] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchSource, setSearchSource] = useState("");

  const messagesEndRef = useRef(null);
  const messagesWrapRef = useRef(null);
  const observerRef = useRef(null);
  const typingTimer = useRef(null);
  const socketRef = useRef(null);
  const roomIdRef = useRef(roomId);
  const userIdRef = useRef(userId);

  const authed = Boolean(token);
  const activeRoom = rooms.find((r) => r.id === roomId) || null;

  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  // Decode user from JWT
  useEffect(() => {
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUserId(payload.sub);
      setUsername(payload.username || payload.email || "");
    } catch {
      setUserId(null);
    }
  }, [token]);

  const refreshRooms = useCallback(async () => {
    if (!token) return;
    setLoadingRooms(true);
    try {
      const list = await fetchRooms();
      setRooms(list);
    } catch {
      toast("Failed to load rooms", "error");
    } finally {
      setLoadingRooms(false);
    }
  }, [token, toast]);

  useEffect(() => { refreshRooms(); }, [refreshRooms]);

  const loadHistory = useCallback(async (opts = {}) => {
    if (!token || !roomId) return;
    const { before, q, append } = opts;
    if (append) setLoadingMore(true);
    else setLoadingMessages(true);

    try {
      const { messages: list, source, nextBefore } = await fetchMessages(roomId, {
        limit: 50,
        before,
        q,
      });
      const normalized = list.map(normalizeMessage);
      if (append) {
        setMessages((prev) => [...normalized, ...prev]);
      } else {
        setMessages(normalized);
      }
      setSearchSource(q ? source : "");
      setHasMore(!q && normalized.length >= 50);
      if (nextBefore) setHasMore(true);
    } catch {
      toast("Failed to load messages", "error");
    } finally {
      setLoadingMessages(false);
      setLoadingMore(false);
    }
  }, [token, roomId, toast]);

  const searchMessages = useCallback(async (q) => {
    if (!token || !roomId || !q?.trim()) return;
    setSearching(true);
    try {
      await loadHistory({ q: q.trim() });
    } finally {
      setSearching(false);
    }
  }, [token, roomId, loadHistory]);

  const clearSearch = useCallback(() => {
    setSearchQ("");
    setSearchSource("");
    loadHistory();
  }, [loadHistory]);

  const addMessage = useCallback((msg) => {
    const normalized = normalizeMessage(msg);
    setMessages((m) => {
      if (m.some((x) => x._id === normalized._id)) return m;
      return [...m, normalized];
    });
    return normalized;
  }, []);

  const confirmMessage = useCallback(({ tempId, message }) => {
    const normalized = normalizeMessage(message);
    setMessages((m) =>
      m.map((msg) => (msg._id === tempId ? normalized : msg))
    );
    setMsgStatus((prev) => {
      if (!tempId || !prev[tempId]) return prev;
      const next = { ...prev };
      next[normalized._id] = next[tempId];
      delete next[tempId];
      return next;
    });
  }, []);

  // Socket connection
  useEffect(() => {
    if (!token) return;

    const s = io(CHAT_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
    });
    socketRef.current = s;

    s.on("connect", () => {
      setConnected(true);
      fetchOnlineUsers().then((ids) => setOnlineUsers(new Set(ids))).catch(() => {});
    });
    s.on("disconnect", () => setConnected(false));
    s.on("connect_error", () => setConnected(false));

    s.on("receive_message", (msg) => {
      const normalized = addMessage(msg);
      const currentRoom = roomIdRef.current;
      if (msg.room_id === currentRoom && msg.user_id !== userIdRef.current) {
        if (!isTempId(normalized._id)) {
          s.emit("message_ack", { messageId: normalized._id, roomId: msg.room_id });
        }
      } else if (msg.room_id !== currentRoom) {
        setUnread((u) => ({ ...u, [msg.room_id]: (u[msg.room_id] || 0) + 1 }));
      }
    });

    s.on("message_confirmed", (payload) => {
      confirmMessage(payload);
      const { message } = payload;
      if (
        message?.room_id === roomIdRef.current &&
        message.user_id !== userIdRef.current
      ) {
        s.emit("message_ack", { messageId: message._id, roomId: message.room_id });
      }
    });

    s.on("message_status", ({ message_id, status: st }) => {
      setMsgStatus((prev) => ({ ...prev, [message_id]: st }));
    });

    s.on("user_typing", (evt) => {
      if (evt.room_id !== roomIdRef.current) return;
      if (evt.user_id === userIdRef.current) return;
      if (evt.typing) {
        setTypingUser(evt.username || "Someone");
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTypingUser(""), 2500);
      } else {
        setTypingUser("");
      }
    });

    s.on("user_online", ({ user_id }) => {
      setOnlineUsers((set) => new Set([...set, user_id]));
    });
    s.on("user_offline", ({ user_id }) => {
      setOnlineUsers((set) => {
        const next = new Set(set);
        next.delete(user_id);
        return next;
      });
    });

    setSocket(s);
    return () => {
      s.removeAllListeners();
      s.close();
      socketRef.current = null;
    };
  }, [token, addMessage, confirmMessage]);

  // Join room on selection
  useEffect(() => {
    if (!socket || !roomId || !authed) return;
    socket.emit("join_room", { roomId }, (ack) => {
      if (ack?.error) {
        toast(ack.error, "error");
        return;
      }
      localStorage.setItem("roomId", roomId);
      setUnread((u) => ({ ...u, [roomId]: 0 }));
      loadHistory();
    });
  }, [socket, roomId, authed, loadHistory, toast]);

  // Read receipts observer
  useEffect(() => {
    if (!socket || !roomId) return;
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const msgId = entry.target.dataset.msgId;
        const senderId = entry.target.dataset.senderId;
        if (msgId && senderId !== userId && !isTempId(msgId)) {
          socket.emit("mark_read", { messageId: msgId, roomId });
          observerRef.current?.unobserve(entry.target);
        }
      });
    }, { threshold: 0.8 });
    return () => observerRef.current?.disconnect();
  }, [socket, roomId, userId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (!loadingMore) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loadingMore]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        setShowCreate(false);
        setShowJoin(false);
        setShowVideo(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleLogin(email, password) {
    const data = await login(email, password);
    setToken(data.accessToken);
  }

  async function handleRegister(email, uname, password) {
    const data = await register(email, uname, password);
    setToken(data.accessToken);
  }

  async function handleLogout() {
    await logout(); // revokes refresh token server-side, then clears local storage
    setToken("");
    setMessages([]);
    setRooms([]);
    setRoomId("");
    socketRef.current?.close();
  }

  async function handleCreateRoom(name, room_type) {
    const data = await createRoom(name, room_type);
    await refreshRooms();
    setRoomId(data.id);
    setShowCreate(false);
    setSidebarOpen(false);
    toast(`Room "${name}" created`, "success");
  }

  async function handleJoinRoom(id) {
    await joinRoom(id);
    await refreshRooms();
    setRoomId(id);
    setShowJoin(false);
    setSidebarOpen(false);
    toast("Joined room", "success");
  }

  function handleSelectRoom(id) {
    if (socket && roomId && roomId !== id) {
      socket.emit("leave_room", { roomId });
    }
    setRoomId(id);
    setMessages([]);
    setSearchQ("");
    setSearchSource("");
    setHasMore(true);
    setSidebarOpen(false);
  }

  function handleSend(content, extras = {}) {
    if (!socket || !roomId) return;
    const text = (content ?? draft).trim();
    if (!text && !extras.file_url) return;
    socket.emit("send_message", {
      roomId,
      content: text,
      message_type: extras.message_type || "text",
      file_url: extras.file_url,
    });
    setDraft("");
  }

  async function handleFileUpload(file) {
    if (!file || !roomId) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const fileUrl = await uploadFile(file, roomId, setUploadProgress);
      const isImage = file.type.startsWith("image/");
      handleSend(file.name, {
        message_type: isImage ? "image" : "file",
        file_url: fileUrl,
        content: isImage ? "" : file.name,
      });
      toast("File sent", "success");
    } catch (err) {
      toast(err.message || "Upload failed", "error");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  function handleDraftChange(v) {
    setDraft(v);
    if (!socket || !roomId) return;
    socket.emit("typing_start", { roomId });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket.emit("typing_stop", { roomId }), 800);
  }

  function handleLoadMore() {
    if (!hasMore || loadingMore || messages.length === 0) return;
    const oldest = messages[0]?.created_at || messages[0]?.timestamp;
    if (oldest) loadHistory({ before: oldest, append: true });
  }

  if (!authed) {
    return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} />;
  }

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar
        className={sidebarOpen ? "open" : ""}
        rooms={rooms}
        activeRoomId={roomId}
        onSelectRoom={handleSelectRoom}
        onCreateRoom={() => setShowCreate(true)}
        onJoinRoom={() => setShowJoin(true)}
        onLogout={handleLogout}
        username={username}
        isConnected={connected}
        loadingRooms={loadingRooms}
        unread={unread}
        onlineUsers={onlineUsers}
      />

      <ChatArea
        room={activeRoom}
        messages={messages}
        msgStatus={msgStatus}
        myUserId={userId}
        draft={draft}
        onDraftChange={handleDraftChange}
        onSend={() => handleSend()}
        onFileUpload={handleFileUpload}
        uploading={uploading}
        uploadProgress={uploadProgress}
        typingUser={typingUser}
        isConnected={connected}
        onVideoCall={() => setShowVideo(true)}
        onMenuClick={() => setSidebarOpen(true)}
        observerRef={observerRef}
        messagesEndRef={messagesEndRef}
        messagesWrapRef={messagesWrapRef}
        searchQ={searchQ}
        onSearchQ={setSearchQ}
        onSearch={searchMessages}
        onClearSearch={clearSearch}
        searching={searching}
        searchSource={searchSource}
        loadingMessages={loadingMessages}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
        onlineUsers={onlineUsers}
      />

      {showVideo && socket && (
        <VideoCall
          socket={socket}
          roomId={roomId}
          onClose={() => setShowVideo(false)}
        />
      )}

      {showCreate && (
        <CreateRoomModal
          onConfirm={handleCreateRoom}
          onClose={() => setShowCreate(false)}
        />
      )}

      {showJoin && (
        <JoinRoomModal
          onConfirm={handleJoinRoom}
          onClose={() => setShowJoin(false)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ChatApp />
      </ToastProvider>
    </ErrorBoundary>
  );
}
