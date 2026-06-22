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
        <div className="modal-title"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'><path d='M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4'/><polyline points='10 17 15 12 10 7'/><line x1='15' y1='12' x2='3' y2='12'/></svg> Join a Room</div>
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
          {error && <div className="auth-error" style={{ marginBottom: "0.75rem" }}><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'><path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'/><line x1='12' y1='9' x2='12' y2='13'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg> {error}</div>}
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
