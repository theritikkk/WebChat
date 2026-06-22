import { useCallback, useEffect, useRef, useState, Fragment } from "react";
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
          <button type="button" className="icon-btn mobile-menu-btn" onClick={onMenuClick}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg></button>
          <span className="chat-mobile-title">WebChat</span>
        </div>
        <div className="no-room">
          <div className="no-room-illustration"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></div>
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
        <button type="button" className="icon-btn mobile-menu-btn" onClick={onMenuClick}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg></button>
        <div className="chat-header-avatar">{getInitials(room.name)}</div>
        <div className="chat-header-info">
          <div className="chat-header-name">{room.name}</div>
          <div className="chat-header-sub">
            {room.room_type === "private" ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 4 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>Private</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 4 }}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>Public</>}
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </button>
          <button type="button" className="icon-btn" onClick={onVideoCall} title="Video call"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg></button>
          <div className={`conn-badge ${isConnected ? "connected" : "disconnected"}`}>
            <span className="conn-dot" />
            {isConnected ? "Live" : "Offline"}
          </div>
        </div>
      </div>

      {showSearch && (
        <div className="search-bar-row">
          <div className="search-box" style={{ flex: 1 }}>
            <span className="search-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg></span>
            <input
              className="search-input"
              placeholder="Search messages (Elasticsearch)…"
              value={searchQ}
              onChange={(e) => onSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch(searchQ)}
              autoFocus
            />
            {searchQ && (
              <button type="button" className="search-clear" onClick={onClearSearch}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
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
          <button type="button" onClick={onClearSearch}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 4 }}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>Clear</button>
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
            <div className="empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></div>
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
              <Fragment key={m._id}>
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
              </Fragment>
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
          accept="image/*,video/*,audio/*,application/pdf,.pdf,text/plain,.txt,application/zip,application/x-zip-compressed,.zip,.doc,.docx"
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
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
