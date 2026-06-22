import { highlightText } from "../utils/message";

function StatusTick({ status }) {
  if (status === "read")
    return (
      <span className="tick-wrap tick-read" title="Read">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 6 7 17 2 12"/><polyline points="22 6 11 17 8 14"/></svg>
      </span>
    );
  if (status === "delivered")
    return (
      <span className="tick-wrap tick-delivered" title="Delivered">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 6 7 17 2 12"/><polyline points="22 6 11 17 8 14"/></svg>
      </span>
    );
  return (
    <span className="tick-wrap tick-sent" title="Sent">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </span>
  );
}

function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MessageContent({ message, searchHighlight }) {
  if (message.message_type === "image" && message.file_url) {
    return (
      <a href={message.file_url} target="_blank" rel="noopener noreferrer" className="msg-image-link">
        <img src={message.file_url} alt={message.content || "Image"} className="msg-image" loading="lazy" />
        {message.content && <span className="msg-content">{message.content}</span>}
      </a>
    );
  }

  if (message.message_type === "video" && message.file_url) {
    return (
      <div className="msg-video-wrap">
        <video src={message.file_url} className="msg-video" controls playsInline preload="metadata" />
        {message.content && <span className="msg-content">{message.content}</span>}
      </div>
    );
  }

  if (message.message_type === "file" && message.file_url) {
    return (
      <a href={message.file_url} target="_blank" rel="noopener noreferrer" className="msg-file-link">
        <div className="msg-file-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        </div>
        <div className="msg-file-info">
          <span className="msg-file-name">{message.content || 'Download file'}</span>
          <span className="msg-file-meta">Click to download</span>
        </div>
      </a>
    );
  }

  const text = message.content || "";
  if (!searchHighlight?.trim()) {
    return <span className="msg-content">{text}</span>;
  }

  const parts = highlightText(text, searchHighlight);
  return (
    <span className="msg-content">
      {parts.map((p) =>
        p.highlight ? (
          <mark key={p.key} className="search-highlight">{p.text}</mark>
        ) : (
          <span key={p.key}>{p.text}</span>
        )
      )}
    </span>
  );
}

export default function MessageBubble({
  message,
  isOwn,
  status,
  observerRef,
  searchHighlight,
}) {
  return (
    <div
      className={`msg-row ${isOwn ? "own" : "other"}`}
      data-msg-id={message._id}
      data-sender-id={message.user_id}
      ref={(el) => {
        if (el && observerRef?.current) observerRef.current.observe(el);
      }}
    >
      {!isOwn && (
        <div className="msg-sender">{message.username || "User"}</div>
      )}
      <div className="msg-bubble">
        <MessageContent message={message} searchHighlight={searchHighlight} />
        <div className="msg-bubble-footer">
          <span className="msg-time">{formatTime(message.created_at || message.timestamp)}</span>
          {isOwn && <StatusTick status={status} />}
        </div>
      </div>
    </div>
  );
}
