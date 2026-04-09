'use client';

/**
 * Per-route error boundary component.
 * Catches rendering errors and shows a graceful fallback UI
 * instead of crashing the entire app (analysis item 4.4).
 */

import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="system-state-shell">
          <div className="system-state-card">
            <span className="system-state-kicker">Something went wrong</span>
            <h1 className="system-state-title">Module Error</h1>
            <p className="system-state-copy">
              This section encountered an unexpected error. The rest of the
              application continues to work normally.
            </p>
            {this.state.error && (
              <pre
                style={{
                  marginTop: 16,
                  padding: 16,
                  borderRadius: 12,
                  background: 'var(--bg-subtle, #eef2f7)',
                  fontSize: 13,
                  color: 'var(--muted, #697382)',
                  overflow: 'auto',
                  maxHeight: 120,
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <div className="system-state-actions">
              <button
                className="primary-btn system-state-btn"
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                Try Again
              </button>
              <button
                className="secondary-btn system-state-btn secondary"
                type="button"
                onClick={() => (window.location.href = '/dashboard')}
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
