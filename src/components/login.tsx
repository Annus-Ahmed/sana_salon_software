"use client";
import { useState } from "react";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
export function Login({ demo }: { demo: boolean }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="wordmark">
          <span className="brand-icon">S</span>Salon<span>OS</span>
        </div>
        <div>
          <p className="eyebrow light">FINANCE MANAGER EDITION</p>
          <h1>
            Your artistry.
            <br />A clearer
            <br />
            <em>business.</em>
          </h1>
          <p>
            A thoughtful home for every booking, every client, and every rupee.
          </p>
        </div>
        <div className="login-footer">
          <span className="fine-line" />
          DESIGNED FOR THE BUSINESS BEHIND THE BEAUTY
        </div>
      </section>
      <section className="login-form">
        <div className="login-card">
          <div className="gold-icon">
            <Sparkles size={22} />
          </div>
          <p className="eyebrow">WELCOME TO YOUR WORKSPACE</p>
          <h2>
            A beautiful day
            <br />
            starts with clarity.
          </h2>
          <p className="muted">Sign in to manage your salon with confidence.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const form = new FormData(e.currentTarget);
              try {
                const r = await fetch("/api/auth/login", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    email: form.get("email"),
                    password: form.get("password"),
                  }),
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error);
                window.location.href = "/dashboard";
              } catch (err) {
                setError((err as Error).message);
                setBusy(false);
              }
            }}
          >
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="you@yourstudio.com"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                minLength={12}
                required
                placeholder="Enter your password"
              />
            </label>
            {error && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}
            <button className="btn primary login-submit" disabled={busy}>
              {busy ? "Signing in…" : "Enter workspace"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="security-note">
            <ShieldCheck size={15} />
            Secure access. Your business records stay protected.
          </p>
          {demo && (
            <div className="demo-login">
              <strong>Demonstration workspace</strong>
              <p>
                Fictional records only. Use the credentials printed by{" "}
                <code>npm run demo:setup</code>.
              </p>
              <span>
                Manager: manager@salonos.demo
                <br />
                Owner: owner@salonos.demo
              </span>
            </div>
          )}
        </div>
        <p className="login-bottom">
          SalonOS <span>•</span> Pakistan Standard Time <span>•</span> PKR
        </p>
      </section>
    </main>
  );
}
