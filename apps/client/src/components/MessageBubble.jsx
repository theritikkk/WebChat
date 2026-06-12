import { highlightText } from "../utils/message";

function StatusTick({ status }) {
  if (status === "read")
    return <span className="tick-wrap tick-read" title="Read">✓✓</span>;
  if (status === "delivered")
    return <span className="tick-wrap tick-delivered" title="Delivered">✓✓</span>;
  return <span className="tick-wrap tick-sent" title="Sent">✓</span>;
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

  if (message.message_type === "file" && message.file_url) {
    return (
      <a href={message.file_url} target="_blank" rel="noopener noreferrer" className="msg-file-link">
        <span className="msg-file-icon">📎</span>
        <span>{message.content || "Download file"}</span>
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
