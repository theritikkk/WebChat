import { useState } from "react";

export default function AuthScreen({ onLogin, onRegister }) {
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
          <div className="auth-logo-icon">💬</div>
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

          {error && <div className="auth-error">⚠ {error}</div>}

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
      </div>
    </div>
  );
}