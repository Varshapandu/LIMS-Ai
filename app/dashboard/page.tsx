"use client";

import { useEffect, useMemo, useState, useRef } from "react";

import { AppShell } from "../components/app-shell";
import { ExportIcon } from "../components/icons";
import { apiRequest } from "../lib/api";
import { calculateDashboardMetrics } from "../lib/billing-storage";
import { downloadBlob } from "../lib/browser-file";
import { realtimeEvents } from "../lib/realtime-events";
import { useAuthRedirect } from "../lib/use-auth-redirect";

type DashboardTrendPoint = {
  day_label: string;
  hematology: number;
  biochemistry: number;
  microbiology: number;
};

type DashboardCategoryItem = {
  category: string;
  count: number;
  percentage: string;
};

type DashboardAlertItem = {
  visit_number: string;
  patient_name: string;
  test_name: string;
  severity: string;
  message: string;
  triggered_at: string;
};

type DashboardSnapshot = {
  overview: {
    total_patients: number;
    revenue: string;
    pending_tests: number;
    completed_tests: number;
    critical_alerts: number;
    today_visits: number;
    reported_visits: number;
  };
  daily_trends: DashboardTrendPoint[];
  category_distribution: DashboardCategoryItem[];
  capacity: {
    utilization_percent: string;
    remaining_percent: string;
    active_tests: number;
    completed_tests: number;
  };
  alerts: DashboardAlertItem[];
};

const emptySnapshot: DashboardSnapshot = {
  overview: {
    total_patients: 0,
    revenue: "0.00",
    pending_tests: 0,
    completed_tests: 0,
    critical_alerts: 0,
    today_visits: 0,
    reported_visits: 0,
  },
  daily_trends: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => ({
    day_label: day,
    hematology: 0,
    biochemistry: 0,
    microbiology: 0,
  })),
  category_distribution: [
    { category: "Biochemistry", count: 0, percentage: "0.00" },
    { category: "Hematology", count: 0, percentage: "0.00" },
    { category: "Microbiology", count: 0, percentage: "0.00" },
  ],
  capacity: {
    utilization_percent: "0.00",
    remaining_percent: "100.00",
    active_tests: 0,
    completed_tests: 0,
  },
  alerts: [],
};

export default function DashboardPage() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAuthenticated = useAuthRedirect();

  // Fetch data from API
  const fetchDashboardData = async () => {
    try {
      const data = await apiRequest<DashboardSnapshot>("/api/dashboard/snapshot");
      setSnapshot(data);
    } catch (error) {
      // If API fails, use metrics from persistent billing storage
      const metrics = calculateDashboardMetrics();
      setSnapshot({
        ...emptySnapshot,
        overview: metrics,
      });
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let active = true;
    
    // Initial data fetch
    (async () => {
      await fetchDashboardData();
      if (active) {
        setLoading(false);
      }
    })();

    // Real-time event listener for immediate updates
    const handleRealtimeEvent = async () => {
      if (active) {
        await fetchDashboardData();
      }
    };

    // Subscribe to all realtime events
    const unsubscribe = realtimeEvents.subscribe("all", () => {
      handleRealtimeEvent();
    });

    // Listen for legacy billing-data-updated event
    const handleBillingUpdate = () => {
      if (active) {
        handleRealtimeEvent();
      }
    };

    window.addEventListener("billing-data-updated", handleBillingUpdate);

    // Set up polling interval (fallback for API-only updates)
    // Refresh every 5 seconds if no events received
    pollingIntervalRef.current = setInterval(() => {
      if (active) {
        fetchDashboardData();
      }
    }, 5000);

    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("billing-data-updated", handleBillingUpdate);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [isAuthenticated]);

  const statCards = useMemo(
    () => [
      { label: "Total Patients", value: snapshot.overview.total_patients.toLocaleString(), footA: `${snapshot.overview.today_visits}`, footB: "VISITS TODAY" },
      { label: "Revenue", value: `Rs ${Number(snapshot.overview.revenue).toLocaleString("en-IN")}`, footA: `${snapshot.overview.reported_visits}`, footB: "REPORTED VISITS" },
      { label: "Pending Tests", value: snapshot.overview.pending_tests.toLocaleString(), footA: `${snapshot.overview.critical_alerts}`, footB: "CRITICAL ALERTS" },
      { label: "Completed Tests", value: snapshot.overview.completed_tests.toLocaleString(), footA: `${snapshot.capacity.completed_tests}`, footB: "APPROVED TESTS" },
    ],
    [snapshot],
  );

  const topCategories = snapshot.category_distribution.slice(0, 3);
  const totalCategoryPercent = topCategories.reduce((accumulator, item) => accumulator + Number(item.percentage), 0);
  const donutValue = Math.min(100, Math.round(totalCategoryPercent));

  function handleExportReport() {
    const reportData = {
      snapshot: snapshot,
      generatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" });
    downloadBlob(blob, `dashboard-report-${new Date().toISOString().split("T")[0]}.json`);
  }

  return (
    <AppShell
      overline="System Overview"
      title="Diagnostic Intelligence"
      action={
        <button className="export-button" type="button" onClick={handleExportReport}>
          <ExportIcon className="export-icon" />
          <span>Export Report</span>
        </button>
      }
    >
      <section className="stats-grid">
        {statCards.map((card, index) => (
          <article className={`stat-card${index === 2 ? " red" : ""}`} key={card.label}>
            <div className="stat-label">{card.label}</div>
            <div className="stat-value">{loading ? "..." : card.value}</div>
            <div className="stat-foot">
              <span className="stat-strong">{card.footA}</span>
              <span>{card.footB}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="content-grid">
        <div>
          <section className="panel trends-panel">
            <div className="panel-head">
              <div>
                <div className="panel-title">Daily Test Trends</div>
                <div className="panel-copy">Volume analytics for high-frequency categories</div>
              </div>
              <div className="legend">
                <div className="legend-item"><span className="legend-dot legend-teal" />Hematology</div>
                <div className="legend-item"><span className="legend-dot legend-navy" />Bio-Chemistry</div>
              </div>
            </div>
            <div className="chart-wrap">
              <div className="chart-grid">
                {snapshot.daily_trends.map((point) => (
                  <div className="day-col" key={point.day_label}>
                    <div className="bar teal" style={{ height: `${Math.max(point.hematology * 22, 8)}px` }} />
                    <div className="bar" style={{ height: `${Math.max(point.biochemistry * 22, 8)}px` }} />
                  </div>
                ))}
              </div>
              <div className="day-labels">
                {snapshot.daily_trends.map((point) => <div key={point.day_label}>{point.day_label}</div>)}
              </div>
            </div>
          </section>

          <section className="panel capacity-panel">
            <div className="capacity-head">
              <div className="capacity-title">Laboratory Capacity</div>
              <div className="capacity-value">{Number(snapshot.capacity.utilization_percent).toFixed(0)}%</div>
            </div>
            <div className="capacity-track">
              <div className="capacity-fill" style={{ width: `${Number(snapshot.capacity.utilization_percent)}%` }} />
            </div>
            <div className="capacity-meta">
              <div>Active Tests: <strong>{snapshot.capacity.active_tests}</strong></div>
              <div>Remaining Bandwidth: <strong>{Number(snapshot.capacity.remaining_percent).toFixed(0)}%</strong></div>
            </div>
          </section>
        </div>

        <div className="side-column">
          <section className="category-card">
            <div className="category-title">Category Distribution</div>
            <div className="donut" style={{ background: `conic-gradient(#0b8d92 0 ${Math.max(Number(topCategories[0]?.percentage || 0), 2)}%, #31415e ${Math.max(Number(topCategories[0]?.percentage || 0), 2)}% ${Math.max(Number(topCategories[0]?.percentage || 0) + Number(topCategories[1]?.percentage || 0), 4)}%, #234f74 ${Math.max(Number(topCategories[0]?.percentage || 0) + Number(topCategories[1]?.percentage || 0), 4)}% 100%)` }} />
            <div className="donut-center">
              <div className="donut-value">{donutValue}%</div>
              <div className="donut-label">Efficiency</div>
            </div>
            <div className="category-list">
              {topCategories.map((item) => (
                <div className="category-row" key={item.category}><span>{item.category}</span><strong>{Number(item.percentage).toFixed(0)}%</strong></div>
              ))}
            </div>
          </section>

          <section className="panel alerts-panel">
            <div className="alerts-title">Critical Alerts</div>
            <div className="bot-badge">AI</div>
            <div className="alert-list">
              {snapshot.alerts.length > 0 ? (
                snapshot.alerts.map((alert) => (
                  <article className="alert-card" key={`${alert.visit_number}-${alert.test_name}`}>
                    <div className="alert-tag">{alert.severity.toUpperCase()} VALUE</div>
                    <div className="alert-copy">{alert.message} for {alert.patient_name} ({alert.visit_number}).</div>
                    <div className="alert-action">{alert.test_name}</div>
                  </article>
                ))
              ) : (
                <>
                  <article className="alert-card teal">
                    <div className="alert-tag">SYSTEM STATUS</div>
                    <div className="alert-copy">No critical alerts yet. Alerts will appear here once samples and results start flowing.</div>
                    <div className="alert-action">WAITING FOR LIVE DATA</div>
                  </article>
                  <article className="alert-card teal">
                    <div className="alert-tag">EQUIPMENT STATUS</div>
                    <div className="alert-copy">No maintenance tasks scheduled yet.</div>
                    <div className="alert-action">READY FOR CONFIGURATION</div>
                  </article>
                </>
              )}
            </div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
