// Production: leave VITE_API_BASE / VITE_CHAT_URL unset for same-origin (nginx proxies /api and /socket.io)
export const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.DEV ? "http://127.0.0.1:4000" : "");
export const CHAT_URL =
  import.meta.env.VITE_CHAT_URL ??
  (import.meta.env.DEV ? "http://127.0.0.1:5000" : "");
