"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type AuthState = "needs_setup" | "ready" | "loading";

export default function LoginPage() {
  const router = useRouter();
  const [state, setState] = useState<AuthState>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/state")
      .then((r) => r.json())
      .then((d: { state: "needs_setup" | "ready"; user: unknown }) => {
        if (!active) return;
        if (d.user) {
          router.replace("/");
          return;
        }
        setState(d.state);
      })
      .catch(() => active && setState("ready"));
    return () => {
      active = false;
    };
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const endpoint = state === "needs_setup" ? "/api/auth/setup" : "/api/auth/login";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setBusy(false);
        return;
      }
      router.replace("/");
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  const isSetup = state === "needs_setup";

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Commute</h1>
        <p className="sub">
          {state === "loading"
            ? "…"
            : isSetup
              ? "Create your owner account to get started."
              : "Sign in to your calendar."}
        </p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={isSetup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            {isSetup && <span className="muted">At least 8 characters.</span>}
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy || state === "loading"} style={{ width: "100%" }}>
            {busy ? "…" : isSetup ? "Create account" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
