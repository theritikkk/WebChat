/** Normalize Mongo/API message shape for the UI */
export function normalizeMessage(msg) {
  if (!msg) return msg;
  const ts = msg.created_at || msg.timestamp;
  return {
    ...msg,
    _id: msg._id?.toString?.() ?? msg._id,
    created_at: ts,
    timestamp: ts,
  };
}

export function isTempId(id) {
  return typeof id === "string" && id.startsWith("temp_");
}

export function highlightText(text, query) {
  if (!query?.trim() || !text) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? { key: i, highlight: true, text: part }
      : { key: i, highlight: false, text: part }
  );
}
