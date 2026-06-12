import { useState } from "react";

export default function CreateRoomModal({ onConfirm, onClose }) {
  const [name, setName]       = useState("");
  const [type, setType]       = useState("public");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    await onConfirm(name.trim(), type);
    setLoading(false);
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Create a Room</div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Room Name</label>
            <input
              className="form-input"
              placeholder="e.g. General, Design, Backend…"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Type</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["public", "private"].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  style={{
                    flex: 1,
                    padding: "0.55rem",
                    border: `1px solid ${type === t ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: "var(--radius)",
                    background: type === t ? "var(--accent-dim)" : "var(--surface-2)",
                    color: type === t ? "var(--accent)" : "var(--text-2)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    transition: "all var(--t)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  {t === "public" ? "🌐" : "🔒"} {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-confirm" disabled={!name.trim() || loading}>
              {loading ? "Creating…" : "Create Room"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}