'use client';

/**
 * Skeleton loading components with shimmer animation.
 * Provides premium loading states for stat cards, tables, and panels,
 * replacing the basic "..." loading text throughout the app.
 */

import React from 'react';

/* ─── Shimmer base ─── */
const shimmerStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, #eef2f7 25%, #f8fafb 37%, #eef2f7 63%)',
  backgroundSize: '400% 100%',
  animation: 'shimmer 1.8s ease-in-out infinite',
  borderRadius: '8px',
};

/* ─── Stat card skeleton ─── */
export function StatCardSkeleton() {
  return (
    <div className="stat-card" style={{ pointerEvents: 'none' }}>
      <div style={{ ...shimmerStyle, width: '60%', height: 18, marginBottom: 20 }} />
      <div style={{ ...shimmerStyle, width: '40%', height: 48, marginBottom: 22 }} />
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ ...shimmerStyle, width: 60, height: 14 }} />
        <div style={{ ...shimmerStyle, width: 80, height: 14 }} />
      </div>
    </div>
  );
}

/* ─── Table row skeleton ─── */
export function TableRowSkeleton({ columns = 6 }: { columns?: number }) {
  return (
    <tr>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} style={{ padding: '16px 14px' }}>
          <div
            style={{
              ...shimmerStyle,
              width: i === 0 ? '70%' : i === columns - 1 ? '50%' : '85%',
              height: 16,
            }}
          />
        </td>
      ))}
    </tr>
  );
}

/* ─── Full table skeleton ─── */
export function TableSkeleton({ rows = 5, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} columns={columns} />
      ))}
    </>
  );
}

/* ─── Panel skeleton ─── */
export function PanelSkeleton({ lines = 4, height = 200 }: { lines?: number; height?: number }) {
  return (
    <div className="panel" style={{ minHeight: height, pointerEvents: 'none' }}>
      <div style={{ ...shimmerStyle, width: '45%', height: 22, marginBottom: 20 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          style={{
            ...shimmerStyle,
            width: `${85 - i * 10}%`,
            height: 14,
            marginBottom: 14,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Stats grid skeleton ─── */
export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="stats-grid">
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

/* ─── Generic content block skeleton ─── */
export function ContentSkeleton({
  width = '100%',
  height = 16,
}: {
  width?: string | number;
  height?: number;
}) {
  return <div style={{ ...shimmerStyle, width, height }} />;
}

/* ─── Page loading skeleton (full page) ─── */
export function PageLoadingSkeleton() {
  return (
    <div className="dashboard-content" style={{ opacity: 0.7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ ...shimmerStyle, width: 280, height: 48 }} />
        <div style={{ ...shimmerStyle, width: 140, height: 44, borderRadius: 14 }} />
      </div>
      <StatsGridSkeleton count={4} />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 32, marginTop: 36 }}>
        <PanelSkeleton lines={6} height={340} />
        <PanelSkeleton lines={4} height={340} />
      </div>
    </div>
  );
}
