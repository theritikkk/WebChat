import { useState } from "react";

export default function JoinRoomModal({ onConfirm, onClose }) {
  const [roomId, setRoomId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!roomId.trim()) return;
    setError("");
    setLoading(true);
    try {
      await onConfirm(roomId.trim());
    } catch (err) {
      setError(err.message || "Failed to join room");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Join a Room</div>
        <p style={{ fontSize: "0.85rem", color: "var(--text-2)", marginBottom: "1rem" }}>
          Enter the room ID shared by a member.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Room ID</label>
            <input
              className="form-input"
              placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              autoFocus
              required
            />
          </div>
          {error && <div className="auth-error" style={{ marginBottom: "0.75rem" }}>⚠ {error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-confirm" disabled={!roomId.trim() || loading}>
              {loading ? "Joining…" : "Join Room"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
