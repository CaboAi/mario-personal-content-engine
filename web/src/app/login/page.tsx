"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      setError("That password did not match.");
      setLoading(false);
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next") || "/";
    window.location.assign(next);
  }

  return (
    <main className="login-shell">
      <section className="login-intro">
        <p className="eyebrow">Private workspace</p>
        <h1>Mario Polanco<br />Content Engine</h1>
        <p>Saved references become Mario-owned decisions here.</p>
      </section>
      <form className="login-form" onSubmit={submit}>
        <span className="brand-mark">MP</span>
        <div>
          <label htmlFor="password">Dashboard password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          <small>Configured privately in the Vercel environment.</small>
        </div>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <button className="primary-action" disabled={loading} type="submit">
          {loading ? "Checking…" : "Enter workspace"}
        </button>
      </form>
    </main>
  );
}
