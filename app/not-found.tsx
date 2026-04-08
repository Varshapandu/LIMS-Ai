import Link from "next/link";

export default function NotFound() {
  return (
    <main className="system-state-shell">
      <section className="system-state-card">
        <span className="system-state-kicker">404</span>
        <h1 className="system-state-title">Page not found</h1>
        <p className="system-state-copy">
          The page you requested is not available right now. You can return to the dashboard and continue working from the main application flow.
        </p>
        <div className="system-state-actions">
          <Link className="primary-btn system-state-btn" href="/dashboard">
            Go to Dashboard
          </Link>
          <Link className="secondary-btn system-state-btn secondary" href="/">
            Go to Sign In
          </Link>
        </div>
      </section>
    </main>
  );
}
