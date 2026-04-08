"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="system-state-shell">
      <section className="system-state-card">
        <span className="system-state-kicker">Application Error</span>
        <h1 className="system-state-title">Something went wrong</h1>
        <p className="system-state-copy">
          The page hit an unexpected problem. You can retry the current view or return to a stable screen and keep using the application.
        </p>
        <div className="system-state-actions">
          <button className="primary-btn system-state-btn" type="button" onClick={() => reset()}>
            Retry
          </button>
          <Link className="secondary-btn system-state-btn secondary" href="/dashboard">
            Back to Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
