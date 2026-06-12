import { useCallback, useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble";
import { useDebounce } from "../hooks/useDebounce";

function getInitials(name = "") {
  return name.slice(0, 2).toUpperCase() || "##";
}

export default function ChatArea({
  room,
  messages,
  msgStatus,
  myUserId,
  draft,
  onDraftChange,
  onSend,
  onFileUpload,
  uploading,
  uploadProgress,
  typingUser,
  isConnected,
  onVideoCall,
  onMenuClick,
  observerRef,
  messagesEndRef,
  messagesWrapRef,
  searchQ,
  onSearchQ,
  onSearch,
  onClearSearch,
  searching,
  searchSource,
  loadingMessages,
  loadingMore,
  hasMore,
  onLoadMore,
  onlineUsers,
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const debouncedSearch = useDebounce(searchQ, 500);

  useEffect(() => {
    if (showSearch && debouncedSearch.trim()) {
      onSearch(debouncedSearch.trim());
    }
  }, [debouncedSearch, showSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = useCallback(() => {
    const el = messagesWrapRef?.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop < 80) onLoadMore?.();
  }, [messagesWrapRef, loadingMore, hasMore, onLoadMore]);

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  function handleInput(e) {
    onDraftChange(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (file) onFileUpload?.(file);
    e.target.value = "";
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFileUpload?.(file);
  }

  if (!room) {
    return (
      <div className="chat-area">
        <div className="chat-mobile-bar">
          <button type="button" className="icon-btn mobile-menu-btn" onClick={onMenuClick}>☰</button>
          <span className="chat-mobile-title">WebChat</span>
        </div>
        <div className="no-room">
          <div className="no-room-illustration">💬</div>
          <div className="no-room-title">No room selected</div>
          <div className="no-room-desc">
            Pick a room from the sidebar or create a new one to start chatting.
          </div>
        </div>
      </div>
    );
  }

  const onlineCount = onlineUsers?.size ?? 0;

  return (
    <div
      className={`chat-area ${dragOver ? "drag-over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="chat-header">
        <button type="button" className="icon-btn mobile-menu-btn" onClick={onMenuClick}>☰</button>
        <div className="chat-header-avatar">{getInitials(room.name)}</div>
        <div className="chat-header-info">
          <div className="chat-header-name">{room.name}</div>
          <div className="chat-header-sub">
            {room.room_type === "private" ? "🔒 Private" : "🌐 Public"}
            {onlineCount > 0 && ` · ${onlineCount} online`}
          </div>
        </div>
        <div className="chat-header-actions">
          <button
            type="button"
            className={`icon-btn ${showSearch ? "active" : ""}`}
            onClick={() => { setShowSearch((s) => !s); if (showSearch) onClearSearch(); }}
            title="Search messages"
          >
            🔍
          </button>
          <button type="button" className="icon-btn" onClick={onVideoCall} title="Video call">📹</button>
          <div className={`conn-badge ${isConnected ? "connected" : "disconnected"}`}>
            <span className="conn-dot" />
            {isConnected ? "Live" : "Offline"}
          </div>
        </div>
      </div>

      {showSearch && (
        <div className="search-bar-row">
          <div className="search-box" style={{ flex: 1 }}>
            <span className="search-icon">⌕</span>
            <input
              className="search-input"
              placeholder="Search messages (Elasticsearch)…"
              value={searchQ}
              onChange={(e) => onSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch(searchQ)}
              autoFocus
            />
            {searchQ && (
              <button type="button" className="search-clear" onClick={onClearSearch}>✕</button>
            )}
          </div>
          <button
            type="button"
            className="search-submit-btn"
            onClick={() => onSearch(searchQ)}
            disabled={searching || !searchQ.trim()}
          >
            {searching ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Searching</> : "Search"}
          </button>
        </div>
      )}

      {searchQ && searchSource && (
        <div className="search-banner">
          <span>Results for &quot;<strong>{searchQ}</strong>&quot; via {searchSource} — {messages.length} found</span>
          <button type="button" onClick={onClearSearch}>✕ Clear</button>
        </div>
      )}

      <div
        className="messages-wrap"
        id="messages-panel"
        ref={messagesWrapRef}
        onScroll={handleScroll}
      >
        {loadingMore && (
          <div className="load-more-indicator">
            <span className="spinner" /> Loading older messages…
          </div>
        )}
        {hasMore && !loadingMore && messages.length > 0 && !searchQ && (
          <button type="button" className="load-more-btn" onClick={onLoadMore}>
            Load older messages
          </button>
        )}

        {loadingMessages ? (
          <div className="messages-skeleton">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`skeleton-bubble ${i % 2 ? "right" : "left"}`} />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💬</div>
            <div className="empty-title">No messages yet</div>
            <div className="empty-desc">
              {searchQ ? "No messages match your search." : "Be the first to say something in this room!"}
            </div>
          </div>
        ) : (
          messages.map((m, i) => {
            const isOwn = m.user_id === myUserId;
            const st = msgStatus[m._id] || m.status || "sent";
            const prev = messages[i - 1];
            const showDate = !prev || (
              new Date(m.created_at || m.timestamp).toDateString() !==
              new Date(prev.created_at || prev.timestamp).toDateString()
            );
            return (
              <div key={m._id}>
                {showDate && (m.created_at || m.timestamp) && (
                  <div className="date-sep">
                    {new Date(m.created_at || m.timestamp).toLocaleDateString([], {
                      weekday: "long", month: "short", day: "numeric",
                    })}
                  </div>
                )}
                <MessageBubble
                  message={m}
                  isOwn={isOwn}
                  status={st}
                  observerRef={observerRef}
                  searchHighlight={searchQ}
                />
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="typing-indicator">
        {typingUser ? (
          <>
            <div className="typing-dots">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
            <span>{typingUser} is typing…</span>
          </>
        ) : (
          <span className="sr-only">No one typing</span>
        )}
      </div>

      {uploading && (
        <div className="upload-progress-bar">
          <div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
          <span>Uploading… {uploadProgress}%</span>
        </div>
      )}

      <div className="compose-area">
        <input
          ref={fileRef}
          type="file"
          className="sr-only"
          accept="image/*,video/*,audio/*,.pdf,.txt,.zip"
          onChange={handleFileSelect}
        />
        <div className="compose-bar">
          <button
            type="button"
            className="compose-action-btn"
            title="Attach file"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            📎
          </button>
          <textarea
            ref={inputRef}
            className="compose-input"
            placeholder="Message… (Enter to send, Shift+Enter for newline)"
            value={draft}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={uploading}
          />
          <button
            type="button"
            className="send-btn"
            onClick={onSend}
            disabled={!draft.trim() || uploading}
            title="Send"
          >
            ➤
          </button>
        </div>
      </div>

      {dragOver && (
        <div className="drop-overlay">
          <span>Drop file to upload</span>
        </div>
      )}
    </div>
  );
}
