import { API_BASE } from "./config.js";

const TOKEN_KEY = "accessToken";
const REFRESH_KEY = "refreshToken";

let refreshPromise = null;

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setTokens({ accessToken, refreshToken }) {
  if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem("roomId");
}

/**
 * Revoke the refresh token server-side, then clear all local tokens.
 * Always resolves — even if the network request fails the local state is cleared.
 */
export async function logout() {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (refreshToken) {
    try {
      await fetch(`${API_BASE}/api/v1/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Non-fatal — still clear local state
    }
  }
  clearTokens();
}

export function getAccessToken() {
  return getStoredToken();
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) throw new Error("Session expired");

  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "Session expired");
        setTokens(data);
        return data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiFetch(path, options = {}, retry = true) {
  const token = getStoredToken();
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && retry && localStorage.getItem(REFRESH_KEY)) {
    try {
      await refreshAccessToken();
      return apiFetch(path, options, false);
    } catch {
      clearTokens();
      throw new Error("Session expired — please sign in again");
    }
  }

  return res;
}

export async function login(email, password) {
  const r = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Login failed");
  setTokens(data);
  return data;
}

export async function register(email, username, password) {
  const reg = await fetch(`${API_BASE}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, username, password }),
  });
  const data = await reg.json().catch(() => ({}));
  if (!reg.ok) throw new Error(data.error || JSON.stringify(data.errors || data));
  setTokens(data);
  return data;
}

export async function fetchRooms() {
  const r = await apiFetch("/api/v1/rooms");
  if (!r.ok) return [];
  const data = await r.json();
  return data.rooms || data || [];
}

export async function createRoom(name, room_type) {
  const r = await apiFetch("/api/v1/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, room_type }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Failed to create room");
  return data;
}

export async function joinRoom(roomId) {
  const r = await apiFetch(`/api/v1/rooms/${roomId}/join`, { method: "POST" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Failed to join room");
  return data;
}

export async function fetchRoomMembers(roomId) {
  const r = await apiFetch(`/api/v1/rooms/${roomId}/members`);
  if (!r.ok) return [];
  const data = await r.json();
  return data.members || data || [];
}

export async function fetchMessages(roomId, { limit = 50, before, q } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  if (q) params.set("q", q);
  const r = await apiFetch(`/api/v1/rooms/${roomId}/messages?${params}`);
  if (!r.ok) return { messages: [], source: "" };
  const data = await r.json();
  return {
    messages: (data.messages || []).map(normalizeFromApi),
    source: data.source || "",
    nextBefore: data.nextBefore,
  };
}

function normalizeFromApi(msg) {
  const ts = msg.created_at || msg.timestamp;
  return { ...msg, _id: msg._id?.toString?.() ?? msg._id, created_at: ts, timestamp: ts };
}

export async function fetchPresence(userId) {
  const r = await apiFetch(`/api/v1/presence/${userId}`);
  if (!r.ok) return false;
  const data = await r.json();
  return Boolean(data.online);
}

export async function fetchOnlineUsers() {
  const r = await apiFetch("/api/v1/presence");
  if (!r.ok) return [];
  const data = await r.json();
  return data.userIds || [];
}

export async function presignUpload({ filename, contentType, roomId, sizeBytes }) {
  const r = await apiFetch("/api/v1/upload/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, contentType, roomId, sizeBytes }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Upload presign failed");
  return data;
}

export async function uploadFile(file, roomId, onProgress) {
  const { uploadUrl, fileUrl } = await presignUpload({
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    roomId,
    sizeBytes: file.size,
  });

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed")));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });

  return fileUrl;
}
