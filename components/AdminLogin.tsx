"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Login failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="adm-login">
      <form className="adm-card" onSubmit={submit}>
        <h2 style={{ marginTop: 0 }}>Admin sign in</h2>
        <label className="adm-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            placeholder="ADMIN_PASSWORD"
          />
        </label>
        {error && <p className="adm-error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
