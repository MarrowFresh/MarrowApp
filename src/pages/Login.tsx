import { useState, type FormEvent } from "react";
import { auth } from "../lib/apiClient";
import { Logo } from "../components/Logo";

// Admin login screen. Shown whenever there is no valid session. On success the
// auth store notifies and App swaps to the admin UI.
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await auth.login(email.trim(), password);
      // auth store notify() re-renders App → admin UI
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form className="panel" onSubmit={submit} style={{ width: 360, maxWidth: "100%" }}>
        <div className="brand" style={{ marginBottom: 16 }}>
          {/* The login card is cream, so the dark mark. */}
          <Logo height={40} />
          <div>
            <div className="name">Marrow<b> Fresh</b></div>
            <div className="tag">ADMIN</div>
          </div>
        </div>

        <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>Sign in</h1>
        <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
          Admin access only.
        </div>

        <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
          style={{ width: "100%", marginBottom: 12, padding: "8px 10px" }}
        />

        <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          style={{ width: "100%", marginBottom: 16, padding: "8px 10px" }}
        />

        {error && (
          <div style={{ color: "#c0392b", fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        <button className="btn primary" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
