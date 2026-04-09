"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { apiRequest } from "./lib/api";
import { DEFAULT_AUTH_USER, isAuthenticated, saveSession } from "./lib/auth-storage";

type LoginResponse = {
  access_token: string;
  role: string;
  full_name: string;
};

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const DEMO_EMAIL = "admin@ailims.com";
const DEMO_PASSWORD = "admin123";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(DEMO_MODE ? DEMO_EMAIL : "");
  const [password, setPassword] = useState(DEMO_MODE ? DEMO_PASSWORD : "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/dashboard");
    }
  }, [router]);

  function completeLocalLogin(name: string, role: string, token?: string) {
    saveSession(
      {
        ...DEFAULT_AUTH_USER,
        name,
        role,
      },
      token,
    );
    router.push("/dashboard");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await apiRequest<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      completeLocalLogin(response.full_name, response.role.split("_").join(" ").toUpperCase(), response.access_token);
      return;
    } catch (requestError) {
      // Only allow demo fallback when demo mode is explicitly enabled
      if (DEMO_MODE && email === DEMO_EMAIL && password === DEMO_PASSWORD) {
        completeLocalLogin("Lab Admin", "ADMIN");
        return;
      }

      const message = requestError instanceof Error ? requestError.message : "Unable to sign in.";
      setError(
        DEMO_MODE
          ? `${message}. The backend is currently unavailable, so only the demo credentials will work in local mode.`
          : message,
      );
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="login-pane login-pane-centered">
        <div className="login-brand">
          <div className="hero-logo-wrap" aria-label="TD ai logo">
            <Image
              src="/d0f96db7-1.png"
              alt="TD ai"
              className="hero-logo"
              width={726}
              height={240}
              priority
            />
          </div>
        </div>
        <div className="login-card">
          <div className="kicker">Secure access</div>
          <h2 className="card-title">Sign in to portal</h2>
          <p className="card-copy">
            {DEMO_MODE
              ? "Use the backend demo credentials and you will be redirected into the operational workspace."
              : "Enter your credentials to access the operational workspace."}
          </p>
          <form className="form-grid" onSubmit={handleSubmit}>
            <div className="field">
              <label className="label" htmlFor="email">Email</label>
              <input className="input" id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </div>
            <div className="field">
              <label className="label" htmlFor="password">Password</label>
              <input className="input" id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" />
            </div>
            <div className="row">
              <label><input type="checkbox" defaultChecked /> Remember me</label>
              {DEMO_MODE && <span>Local demo fallback enabled</span>}
            </div>
            <button className="primary-btn" type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
          </form>
          {error ? <div className="error-banner">{error}</div> : null}
          {DEMO_MODE && (
            <div className="cred-box">
              <div><strong>Demo email:</strong> {DEMO_EMAIL}</div>
              <div><strong>Demo password:</strong> {DEMO_PASSWORD}</div>
            </div>
          )}
          <div className="quick-roles">
            <span className="role-pill">Admin</span>
            <span className="role-pill">Lab Technician</span>
            <span className="role-pill">Doctor</span>
          </div>
          {DEMO_MODE && (
            <div className="footer-note">Backend login will work once the FastAPI environment is installed with a supported Python version.</div>
          )}
        </div>
      </section>
    </main>
  );
}
