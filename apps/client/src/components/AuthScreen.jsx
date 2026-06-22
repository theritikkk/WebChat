import { useState } from "react";

export default function AuthScreen({ onLogin, onRegister, onBackToHome }) {
  const [tab, setTab]         = useState("login");
  const [email, setEmail]     = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (tab === "login") {
        await onLogin(email, password);
      } else {
        await onRegister(email, username, password);
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-glow" />

      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'><path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/></svg>
          </div>
          <span className="auth-logo-text">WebChat</span>
        </div>

        <h1 className="auth-title">
          {tab === "login" ? "Welcome back" : "Create account"}
        </h1>
        <p className="auth-subtitle">
          {tab === "login"
            ? "Sign in to continue to your workspace"
            : "Get started with WebChat today"}
        </p>

        {/* Tabs */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${tab === "login" ? "active" : ""}`}
            onClick={() => { setTab("login"); setError(""); }}
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${tab === "register" ? "active" : ""}`}
            onClick={() => { setTab("register"); setError(""); }}
          >
            Register
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          {tab === "register" && (
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                className="form-input"
                type="text"
                placeholder="yourname"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              placeholder={tab === "register" ? "Min 8 characters" : "••••••••"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={tab === "login" ? "current-password" : "new-password"}
            />
          </div>

          {error && <div className="auth-error"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'><path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'/><line x1='12' y1='9' x2='12' y2='13'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg> {error}</div>}

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading
              ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span className="spinner" style={{ width: 16, height: 16 }} />
                  {tab === "login" ? "Signing in…" : "Creating account…"}
                </span>
              : tab === "login" ? "Sign In" : "Create Account"
            }
          </button>
        </form>

        {onBackToHome && (
          <button
            type="button"
            className="btn-back-home"
            onClick={onBackToHome}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              color: "var(--text-3)",
              fontSize: "0.85rem",
              marginTop: "1.25rem",
              cursor: "pointer",
              transition: "color 0.2s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px"
            }}
            onMouseEnter={(e) => e.target.style.color = "var(--text)"}
            onMouseLeave={(e) => e.target.style.color = "var(--text-3)"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            Back to Home
          </button>
        )}
      </div>
    </div>
  );
}