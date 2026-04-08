"use client";

import { useEffect, useMemo, useState } from "react";

import { AppShell } from "../components/app-shell";
import { apiRequest } from "../lib/api";
import { downloadBlob } from "../lib/browser-file";
import { buildLocalReportsAnalytics, hasMeaningfulAnalytics } from "../lib/reports-fallback";
import { realtimeEvents } from "../lib/realtime-events";
import { useAuthRedirect } from "../lib/use-auth-redirect";
import { WORKFLOW_UPDATED_EVENT } from "../lib/workflow-storage";

type FilterOption = {
  label: string;
  value: string;
};

type MetricCard = {
  label: string;
  value: string | number;
  change_percent: string;
  change_direction: string;
  footnote: string;
  accent: string;
};

type DepartmentPerformanceItem = {
  department_code: string;
  department_name: string;
  actual_revenue: string;
  target_revenue: string;
  growth_percent: string;
  sample_count: number;
};

type BottleneckItem = {
  stage: string;
  backlog_count: number;
  throughput_percent: string;
  status: string;
  tone: string;
  note: string;
};

type DistributionItem = {
  label: string;
  count: number;
  percentage: string;
};

type TopTestItem = {
  test_code: string;
  test_name: string;
  department_name: string;
  sample_type: string;
  monthly_volume: number;
  avg_revenue_per_test: string;
  avg_tat_hours: string;
  abnormal_rate: string;
  efficiency_status: string;
  efficiency_tone: string;
};

type RecentReportItem = {
  report_number: string;
  visit_number: string;
  patient_name: string;
  department_name: string;
  report_status: string;
  generated_at?: string | null;
  item_count: number;
};

type ReportsAnalyticsResponse = {
  generated_at: string;
  date_range_days: number;
  selected_department: string;
  selected_test_type: string;
  available_departments: FilterOption[];
  available_test_types: FilterOption[];
  metric_cards: MetricCard[];
  department_performance: DepartmentPerformanceItem[];
  bottlenecks: BottleneckItem[];
  gender_distribution: DistributionItem[];
  age_distribution: DistributionItem[];
  priority_distribution: DistributionItem[];
  top_tests: TopTestItem[];
  recent_reports: RecentReportItem[];
  strategic_notes: string[];
};

type FiltersState = {
  dateRangeDays: number;
  department: string;
  testType: string;
};

const emptyAnalytics: ReportsAnalyticsResponse = {
  generated_at: new Date().toISOString(),
  date_range_days: 30,
  selected_department: "all",
  selected_test_type: "all",
  available_departments: [{ label: "All Departments", value: "all" }],
  available_test_types: [{ label: "All Test Types", value: "all" }],
  metric_cards: [],
  department_performance: [],
  bottlenecks: [],
  gender_distribution: [],
  age_distribution: [],
  priority_distribution: [],
  top_tests: [],
  recent_reports: [],
  strategic_notes: [],
};

function asNumber(value: string | number | null | undefined) {
  return Number(value || 0);
}

function formatCurrency(value: string | number) {
  return `Rs ${asNumber(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatMetricValue(card: MetricCard) {
  if (card.label === "Average TAT") {
    return `${asNumber(card.value).toFixed(1)} hrs`;
  }
  if (card.label === "Revenue MTD") {
    return formatCurrency(card.value);
  }
  if (card.label === "Rerun Rate") {
    return `${asNumber(card.value).toFixed(1)}%`;
  }
  return asNumber(card.value).toLocaleString("en-IN");
}

function formatPercent(value: string | number) {
  const numeric = asNumber(value);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(1)}%`;
}

function formatTimestamp(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function exportCsv(rows: TopTestItem[]) {
  const headers = [
    "Test Code",
    "Test Name",
    "Department",
    "Sample Type",
    "Monthly Volume",
    "Avg Revenue/Test",
    "Avg TAT (hrs)",
    "Abnormal Rate (%)",
    "Efficiency Status",
  ];
  const lines = rows.map((row) => [
    row.test_code,
    row.test_name,
    row.department_name,
    row.sample_type,
    row.monthly_volume,
    row.avg_revenue_per_test,
    row.avg_tat_hours,
    row.abnormal_rate,
    row.efficiency_status,
  ]);
  const csv = [headers, ...lines]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `reports-analytics-${new Date().toISOString().split("T")[0]}.csv`);
}

function printAnalytics(data: ReportsAnalyticsResponse) {
  const popup = window.open("", "_blank", "width=1200,height=900");
  if (!popup) {
    return false;
  }

  const metricHtml = data.metric_cards
    .map(
      (card) => `
        <div class="metric">
          <div class="label">${card.label}</div>
          <div class="value">${formatMetricValue(card)}</div>
          <div class="foot">${card.footnote}</div>
        </div>
      `,
    )
    .join("");

  const testRows = data.top_tests
    .map(
      (item) => `
        <tr>
          <td>${item.test_name}</td>
          <td>${item.department_name}</td>
          <td>${item.monthly_volume}</td>
          <td>${formatCurrency(item.avg_revenue_per_test)}</td>
          <td>${item.avg_tat_hours} hrs</td>
          <td>${item.efficiency_status}</td>
        </tr>
      `,
    )
    .join("");

  popup.document.write(`
    <html>
      <head>
        <title>Reports Analytics</title>
        <style>
          body { font-family: "Segoe UI", sans-serif; padding: 32px; color: #0d1b2a; }
          h1 { margin: 0 0 8px; font-size: 36px; }
          p { color: #4d5b70; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 28px 0; }
          .metric { border: 1px solid #dce5e8; border-radius: 18px; padding: 18px; }
          .label { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #5f7083; }
          .value { font-size: 28px; font-weight: 700; margin-top: 10px; }
          .foot { margin-top: 10px; color: #708195; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; margin-top: 24px; }
          th, td { padding: 14px 12px; border-bottom: 1px solid #e7ecef; text-align: left; }
          th { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #617187; }
        </style>
      </head>
      <body>
        <h1>Intelligence & Analytics</h1>
        <p>Generated ${formatTimestamp(data.generated_at)}</p>
        <div class="grid">${metricHtml}</div>
        <h2>High-Volume Analytics</h2>
        <table>
          <thead>
            <tr>
              <th>Test</th>
              <th>Department</th>
              <th>Volume</th>
              <th>Revenue/Test</th>
              <th>Avg TAT</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${testRows}</tbody>
        </table>
      </body>
    </html>
  `);
  popup.document.close();
  popup.focus();
  popup.print();
  return true;
}

export default function ReportsPage() {
  const [analytics, setAnalytics] = useState<ReportsAnalyticsResponse>(emptyAnalytics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sourceLabel, setSourceLabel] = useState("Loading live analytics...");
  const [printMessage, setPrintMessage] = useState("");
  const [filters, setFilters] = useState<FiltersState>({
    dateRangeDays: 30,
    department: "all",
    testType: "all",
  });
  const [draftFilters, setDraftFilters] = useState<FiltersState>({
    dateRangeDays: 30,
    department: "all",
    testType: "all",
  });

  const isAuthenticated = useAuthRedirect();

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let active = true;

    async function loadAnalytics() {
      setLoading(true);

      try {
        const query = new URLSearchParams({
          date_range_days: String(filters.dateRangeDays),
          department: filters.department,
          test_type: filters.testType,
        });
        const data = await apiRequest<ReportsAnalyticsResponse>(`/api/reports/analytics?${query.toString()}`);
        if (!active) {
          return;
        }
        const fallbackData = buildLocalReportsAnalytics(filters) as ReportsAnalyticsResponse;
        const shouldUseFallback = !hasMeaningfulAnalytics(data) && hasMeaningfulAnalytics(fallbackData);
        setAnalytics(shouldUseFallback ? fallbackData : data);
        setDraftFilters({
          dateRangeDays: (shouldUseFallback ? fallbackData : data).date_range_days,
          department: (shouldUseFallback ? fallbackData : data).selected_department,
          testType: (shouldUseFallback ? fallbackData : data).selected_test_type,
        });
        setError("");
        setSourceLabel(shouldUseFallback ? "Showing local workflow data because backend analytics returned no rows." : "Showing backend analytics.");
      } catch (requestError) {
        if (!active) {
          return;
        }
        const fallbackData = buildLocalReportsAnalytics(filters) as ReportsAnalyticsResponse;
        if (hasMeaningfulAnalytics(fallbackData)) {
          setAnalytics(fallbackData);
          setDraftFilters({
            dateRangeDays: fallbackData.date_range_days,
            department: fallbackData.selected_department,
            testType: fallbackData.selected_test_type,
          });
          setError("");
          setSourceLabel("Backend analytics is unavailable. Showing local workflow and billing data.");
        } else {
          setError(requestError instanceof Error ? requestError.message : "Unable to load analytics.");
          setAnalytics({
            ...emptyAnalytics,
            generated_at: new Date().toISOString(),
            date_range_days: filters.dateRangeDays,
            selected_department: filters.department,
            selected_test_type: filters.testType,
          });
          setSourceLabel("No backend data and no local workflow data are available yet.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadAnalytics();
    const interval = setInterval(loadAnalytics, 15000);
    const unsubscribeRealtime = realtimeEvents.subscribe("all", () => {
      if (active) {
        void loadAnalytics();
      }
    });
    const handleBillingUpdate = () => {
      if (active) {
        void loadAnalytics();
      }
    };
	    const handleStorage = () => {
	      if (active) {
	        void loadAnalytics();
	      }
	    };
	    const handleWorkflowUpdated = () => {
	      if (active) {
	        void loadAnalytics();
	      }
	    };
	    window.addEventListener("billing-data-updated", handleBillingUpdate);
	    window.addEventListener("storage", handleStorage);
	    window.addEventListener(WORKFLOW_UPDATED_EVENT, handleWorkflowUpdated);
	
	    return () => {
	      active = false;
	      unsubscribeRealtime();
	      window.removeEventListener("billing-data-updated", handleBillingUpdate);
	      window.removeEventListener("storage", handleStorage);
	      window.removeEventListener(WORKFLOW_UPDATED_EVENT, handleWorkflowUpdated);
	      clearInterval(interval);
	    };
  }, [filters, isAuthenticated]);

  const maxDepartmentRevenue = useMemo(() => {
    const values = analytics.department_performance.flatMap((item) => [asNumber(item.actual_revenue), asNumber(item.target_revenue)]);
    return Math.max(...values, 1);
  }, [analytics.department_performance]);

  const currentCohortLabel = useMemo(() => {
    const departmentLabel = analytics.available_departments.find((item) => item.value === analytics.selected_department)?.label || "All Departments";
    const testTypeLabel = analytics.available_test_types.find((item) => item.value === analytics.selected_test_type)?.label || "All Test Types";
    return `${analytics.date_range_days} day cohort | ${departmentLabel} | ${testTypeLabel}`;
  }, [analytics]);

  return (
    <AppShell
      overline="Reporting"
      title="Intelligence & Analytics"
      searchPlaceholder="Search reports, tests, departments, or visits..."
      hidePageHeading
    >
      <div className="reports-page-shell">
        <section className="reports-page-hero">
          <div>
            <div className="reports-kicker">Operational Reporting</div>
            <div className="reports-title-row">
              <div>
                <h1 className="reports-main-title">Intelligence & Analytics</h1>
                <p className="reports-subtitle">Real-time performance metrics, test throughput, report issuance, and patient demographics from the live lab dataset.</p>
              </div>
              <div className="reports-hero-actions">
                <button
                  className="reports-action-btn mint"
                  type="button"
                  onClick={() => {
                    const printed = printAnalytics(analytics);
                    setPrintMessage(printed ? "" : "Popup blocked. Please allow popups to print analytics.");
                  }}
                  disabled={loading}
                >
                  Download PDF
                </button>
                <button className="reports-action-btn ink" type="button" onClick={() => exportCsv(analytics.top_tests)} disabled={loading || analytics.top_tests.length === 0}>
                  Export CSV
                </button>
              </div>
            </div>
          </div>

          <div className="reports-filter-shell">
            <div className="reports-filter-grid">
              <label className="reports-filter-field">
                <span>Date Range</span>
                <select
                  value={draftFilters.dateRangeDays}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, dateRangeDays: Number(event.target.value) }))}
                >
                  <option value={7}>Last 7 Days</option>
                  <option value={30}>Last 30 Days</option>
                  <option value={90}>Last 90 Days</option>
                </select>
              </label>

              <label className="reports-filter-field">
                <span>Department</span>
                <select
                  value={draftFilters.department}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, department: event.target.value }))}
                >
                  {analytics.available_departments.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="reports-filter-field">
                <span>Test Type</span>
                <select
                  value={draftFilters.testType}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, testType: event.target.value }))}
                >
                  {analytics.available_test_types.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <button className="reports-apply-btn" type="button" onClick={() => setFilters(draftFilters)} disabled={loading}>
                Apply Filters
              </button>
            </div>
            <div className="reports-filter-foot">
              <span>{currentCohortLabel} | {sourceLabel}</span>
              <strong>Updated {formatTimestamp(analytics.generated_at)}</strong>
            </div>
          </div>
        </section>

        {error ? <div className="reports-error-banner">{error}</div> : null}
        {printMessage ? <div className="reports-error-banner">{printMessage}</div> : null}

        <section className="reports-metric-grid">
          {analytics.metric_cards.map((card) => (
            <article key={card.label} className={`reports-metric-card ${card.accent}`}>
              <div className="reports-metric-label">{card.label}</div>
              <div className="reports-metric-value">{loading ? "..." : formatMetricValue(card)}</div>
              <div className={`reports-metric-change ${card.change_direction === "down" && card.label !== "Average TAT" ? "negative" : ""}`}>
                {formatPercent(card.change_percent)}
              </div>
              <div className="reports-metric-foot">{card.footnote}</div>
            </article>
          ))}
        </section>

        <section className="reports-primary-grid">
          <article className="reports-card reports-department-card">
            <div className="reports-card-head">
              <div>
                <h2>Departmental Revenue Growth</h2>
                <p>Actual revenue versus target revenue for the selected reporting window.</p>
              </div>
              <div className="reports-mini-legend">
                <span><i className="actual" />Actual</span>
                <span><i className="target" />Target</span>
              </div>
            </div>

            <div className="reports-bar-chart">
              {analytics.department_performance.length > 0 ? (
                analytics.department_performance.map((item) => (
                  <div key={item.department_code} className="reports-bar-group">
                    <div className="reports-bar-stack">
                      <div
                        className="reports-bar target"
                        style={{ height: `${Math.max((asNumber(item.target_revenue) / maxDepartmentRevenue) * 260, 22)}px` }}
                        title={`Target ${formatCurrency(item.target_revenue)}`}
                      />
                      <div
                        className="reports-bar actual"
                        style={{ height: `${Math.max((asNumber(item.actual_revenue) / maxDepartmentRevenue) * 260, 18)}px` }}
                        title={`Actual ${formatCurrency(item.actual_revenue)}`}
                      />
                    </div>
                    <div className="reports-bar-code">{item.department_code}</div>
                    <div className="reports-bar-note">{item.sample_count} tests</div>
                  </div>
                ))
              ) : (
                <div className="reports-empty-state">No departmental activity is available for the selected filters yet.</div>
              )}
            </div>
          </article>

          <article className="reports-bottleneck-card">
            <div className="reports-bottleneck-head">
              <h2>Testing Bottlenecks</h2>
              <p>Workflow stages with the highest queue pressure.</p>
            </div>

            <div className="reports-bottleneck-list">
              {analytics.bottlenecks.map((item) => (
                <div key={item.stage} className="reports-bottleneck-item">
                  <div className="reports-bottleneck-row">
                    <strong>{item.stage}</strong>
                    <span className={`reports-bottleneck-status ${item.tone}`}>{item.status}</span>
                  </div>
                  <div className="reports-bottleneck-track">
                    <div className={`reports-bottleneck-fill ${item.tone}`} style={{ width: `${asNumber(item.throughput_percent)}%` }} />
                  </div>
                  <div className="reports-bottleneck-meta">
                    <span>{item.backlog_count} queued</span>
                    <span>{asNumber(item.throughput_percent).toFixed(0)}% throughput</span>
                  </div>
                  <p>{item.note}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="reports-secondary-grid">
          <article className="reports-card">
            <div className="reports-card-head">
              <div>
                <h2>Population Demographics</h2>
                <p>Gender and age distribution across the active cohort.</p>
              </div>
            </div>

            <div className="reports-demographics-grid">
              <div className="reports-distribution-block">
                <div className="reports-block-title">Gender Mix</div>
                {analytics.gender_distribution.map((item) => (
                  <div key={item.label} className="reports-distribution-row">
                    <div className="reports-distribution-copy">
                      <strong>{item.label}</strong>
                      <span>{item.count} patients</span>
                    </div>
                    <div className="reports-distribution-visual">
                      <div className="reports-distribution-track">
                        <div className="reports-distribution-fill teal" style={{ width: `${asNumber(item.percentage)}%` }} />
                      </div>
                      <em>{asNumber(item.percentage).toFixed(0)}%</em>
                    </div>
                  </div>
                ))}
              </div>

              <div className="reports-distribution-block">
                <div className="reports-block-title">Age Bands</div>
                {analytics.age_distribution.map((item) => (
                  <div key={item.label} className="reports-distribution-row">
                    <div className="reports-distribution-copy">
                      <strong>{item.label}</strong>
                      <span>{item.count} patients</span>
                    </div>
                    <div className="reports-distribution-visual">
                      <div className="reports-distribution-track">
                        <div className="reports-distribution-fill navy" style={{ width: `${asNumber(item.percentage)}%` }} />
                      </div>
                      <em>{asNumber(item.percentage).toFixed(0)}%</em>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="reports-card">
            <div className="reports-card-head">
              <div>
                <h2>Operational Mix</h2>
                <p>Priority distribution and analyst-facing strategic notes.</p>
              </div>
            </div>

            <div className="reports-priority-grid">
              {analytics.priority_distribution.map((item) => (
                <div key={item.label} className="reports-priority-card">
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                  <small>{asNumber(item.percentage).toFixed(0)}% of current samples</small>
                </div>
              ))}
            </div>

            <div className="reports-notes-panel">
              <div className="reports-block-title">Strategic Notes</div>
              {analytics.strategic_notes.length > 0 ? (
                analytics.strategic_notes.map((note) => (
                  <div key={note} className="reports-note-item">{note}</div>
                ))
              ) : (
                <div className="reports-empty-note">Insights will appear once report traffic and results are available.</div>
              )}
            </div>
          </article>
        </section>

        <section className="reports-table-card">
          <div className="reports-table-headline">
            <div>
              <h2>High-Volume Analytics</h2>
              <p>Tests with the highest reporting volume, value, and turnaround impact.</p>
            </div>
          </div>

          <div className="reports-table-head">
            <span>Test Description</span>
            <span>Monthly Volume</span>
            <span>Avg Revenue/Test</span>
            <span>Avg TAT</span>
            <span>Abnormality Rate</span>
            <span>Efficiency Status</span>
          </div>

          <div className="reports-table-body">
            {analytics.top_tests.length > 0 ? (
              analytics.top_tests.map((item) => (
                <div key={item.test_code} className="reports-table-row">
                  <div className="reports-test-cell">
                    <i className={item.efficiency_tone} />
                    <div>
                      <strong>{item.test_name}</strong>
                      <span>{item.department_name} • {item.sample_type} • {item.test_code}</span>
                    </div>
                  </div>
                  <div>{item.monthly_volume.toLocaleString("en-IN")}</div>
                  <div>{formatCurrency(item.avg_revenue_per_test)}</div>
                  <div>{asNumber(item.avg_tat_hours).toFixed(1)} hrs</div>
                  <div>{asNumber(item.abnormal_rate).toFixed(1)}%</div>
                  <div>
                    <span className={`reports-status-pill ${item.efficiency_tone}`}>{item.efficiency_status}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="reports-empty-state table">No test analytics are available for this filter combination.</div>
            )}
          </div>
        </section>

        <section className="reports-table-card">
          <div className="reports-table-headline">
            <div>
              <h2>Recent Report Issuance</h2>
              <p>Latest generated reports and the departments contributing to them.</p>
            </div>
          </div>

          <div className="reports-table-head recent">
            <span>Report Number</span>
            <span>Visit</span>
            <span>Patient</span>
            <span>Department</span>
            <span>Items</span>
            <span>Status</span>
          </div>

          <div className="reports-table-body">
            {analytics.recent_reports.length > 0 ? (
              analytics.recent_reports.map((item) => (
                <div key={`${item.report_number}-${item.department_name}`} className="reports-table-row recent">
                  <div className="reports-report-pill">
                    <strong>{item.report_number}</strong>
                    <span>{formatTimestamp(item.generated_at)}</span>
                  </div>
                  <div>{item.visit_number}</div>
                  <div>{item.patient_name}</div>
                  <div>{item.department_name}</div>
                  <div>{item.item_count}</div>
                  <div>
                    <span className="reports-status-pill neutral">{item.report_status}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="reports-empty-state table">No reports have been generated in the selected time window yet.</div>
            )}
          </div>
        </section>

        <style jsx>{`
          .reports-page-shell { display: grid; gap: 28px; padding-bottom: 32px; }
          .reports-page-hero { display: grid; gap: 24px; padding: 8px 0 0; }
          .reports-kicker { color: #0c8f97; font-size: 12px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; }
          .reports-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
          .reports-main-title { margin: 10px 0 0; color: #111827; font-size: clamp(42px, 5vw, 64px); line-height: 0.94; letter-spacing: -0.05em; }
          .reports-subtitle { max-width: 760px; margin: 14px 0 0; color: #6d7885; font-size: 17px; line-height: 1.65; }
          .reports-hero-actions { display: flex; gap: 14px; flex-wrap: nowrap; align-items: center; }
          .reports-action-btn, .reports-apply-btn { border: 0; border-radius: 14px; padding: 18px 26px; font-size: 16px; font-weight: 800; cursor: pointer; transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease; white-space: nowrap; }
          .reports-action-btn:hover, .reports-apply-btn:hover { transform: translateY(-1px); }
          .reports-action-btn:disabled, .reports-apply-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
          .reports-action-btn.mint { background: linear-gradient(135deg, #8ceceb 0%, #c9faf6 100%); color: #20565c; box-shadow: 0 18px 32px rgba(58, 185, 183, 0.18); }
          .reports-action-btn.ink, .reports-apply-btn { background: linear-gradient(135deg, #0b1528 0%, #1d2d4f 100%); color: #f6f7fb; box-shadow: 0 18px 32px rgba(10, 21, 40, 0.18); }
          .reports-filter-shell { padding: 24px; border-radius: 28px; background: linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(248, 249, 243, 0.95)); border: 1px solid #ecece5; box-shadow: 0 20px 44px rgba(16, 27, 45, 0.06); }
          .reports-filter-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; gap: 18px; align-items: end; }
          .reports-filter-field { display: grid; gap: 10px; }
          .reports-filter-field span { color: #495469; font-size: 12px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; }
          .reports-filter-field select { height: 56px; border: 1px solid #e0e4e7; border-radius: 14px; background: #ffffff; padding: 0 16px; color: #172033; font-size: 16px; outline: none; }
          .reports-filter-foot { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-top: 16px; color: #637188; font-size: 14px; }
          .reports-filter-foot strong { color: #1f2a3c; font-weight: 700; }
          .reports-error-banner { padding: 16px 18px; border-radius: 18px; background: #fff1f2; color: #a12735; font-size: 15px; font-weight: 600; }
          .reports-metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }
          .reports-metric-card, .reports-card, .reports-table-card, .reports-bottleneck-card { border-radius: 28px; background: linear-gradient(180deg, #ffffff 0%, #fbfcfd 100%); box-shadow: 0 24px 56px rgba(16, 27, 45, 0.08); }
          .reports-metric-card { min-height: 190px; padding: 28px; position: relative; overflow: hidden; border-left: 5px solid #0b8d92; }
          .reports-metric-card.navy { border-left-color: #5f82c3; }
          .reports-metric-card.red { border-left-color: #d12631; }
          .reports-metric-label { color: #4a5569; font-size: 14px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; }
          .reports-metric-value { margin-top: 18px; color: #111827; font-size: clamp(28px, 2vw, 44px); font-weight: 800; line-height: 1.05; letter-spacing: -0.05em; }
          .reports-metric-change { margin-top: 14px; color: #0e9185; font-size: 15px; font-weight: 700; }
          .reports-metric-change.negative { color: #c92b2f; }
          .reports-metric-foot { margin-top: 14px; color: #708093; font-size: 14px; }
          .reports-primary-grid { display: grid; grid-template-columns: minmax(0, 1.9fr) minmax(320px, 0.9fr); gap: 24px; }
          .reports-card, .reports-bottleneck-card, .reports-table-card { padding: 28px; }
          .reports-card-head, .reports-bottleneck-head, .reports-table-headline { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
          .reports-card-head h2, .reports-bottleneck-head h2, .reports-table-headline h2 { margin: 0; color: #131d2d; font-size: 30px; letter-spacing: -0.03em; }
          .reports-card-head p, .reports-bottleneck-head p, .reports-table-headline p { margin: 8px 0 0; color: #6d798a; font-size: 15px; line-height: 1.55; }
          .reports-mini-legend { display: flex; gap: 16px; color: #495468; font-size: 14px; font-weight: 600; }
          .reports-mini-legend span { display: inline-flex; align-items: center; gap: 8px; }
          .reports-mini-legend i { width: 12px; height: 12px; border-radius: 999px; display: inline-block; }
          .reports-mini-legend .actual { background: #0d7d7e; }
          .reports-mini-legend .target { background: #d3ece8; }
          .reports-bar-chart { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 18px; align-items: end; min-height: 360px; margin-top: 28px; padding: 28px 10px 12px; border-radius: 20px; background: linear-gradient(180deg, #f8faf8 0%, #fbfdfd 100%); }
          .reports-bar-group { display: grid; justify-items: center; gap: 10px; }
          .reports-bar-stack { width: 100%; min-height: 280px; display: flex; align-items: end; justify-content: center; gap: 8px; }
          .reports-bar { width: 28px; border-radius: 10px 10px 0 0; box-shadow: inset 0 -8px 18px rgba(255, 255, 255, 0.12); }
          .reports-bar.actual { background: linear-gradient(180deg, #0d9494 0%, #0f6f71 100%); }
          .reports-bar.target { background: linear-gradient(180deg, #dff2ef 0%, #c3e8e2 100%); }
          .reports-bar-code { color: #212b3c; font-size: 12px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; }
          .reports-bar-note { color: #6d7988; font-size: 12px; }
          .reports-bottleneck-card { background: linear-gradient(180deg, #081426 0%, #0e1a31 100%); color: #eef4ff; }
          .reports-bottleneck-head h2 { color: #83ece9; }
          .reports-bottleneck-head p { color: #aab5c7; }
          .reports-bottleneck-list { display: grid; gap: 20px; margin-top: 28px; }
          .reports-bottleneck-item { display: grid; gap: 10px; }
          .reports-bottleneck-row, .reports-bottleneck-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
          .reports-bottleneck-row strong { color: #f6fbff; font-size: 15px; letter-spacing: 0.12em; text-transform: uppercase; }
          .reports-bottleneck-status { font-size: 13px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
          .reports-bottleneck-status.normal { color: #8cece6; }
          .reports-bottleneck-status.warning { color: #f2d18d; }
          .reports-bottleneck-status.critical { color: #ff6f76; }
          .reports-bottleneck-track { height: 8px; border-radius: 999px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
          .reports-bottleneck-fill { height: 100%; border-radius: inherit; }
          .reports-bottleneck-fill.normal { background: linear-gradient(90deg, #8cece6 0%, #59c7c2 100%); }
          .reports-bottleneck-fill.warning { background: linear-gradient(90deg, #f4d18b 0%, #d4a547 100%); }
          .reports-bottleneck-fill.critical { background: linear-gradient(90deg, #ff6f76 0%, #d22532 100%); }
          .reports-bottleneck-meta, .reports-bottleneck-item p { color: #9aa8bf; font-size: 13px; line-height: 1.5; margin: 0; }
          .reports-secondary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
          .reports-demographics-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; margin-top: 28px; }
          .reports-distribution-block, .reports-notes-panel { padding: 20px; border-radius: 22px; background: linear-gradient(180deg, #f9fbfb 0%, #f4f7f8 100%); border: 1px solid #ebf0f2; }
          .reports-block-title { color: #172033; font-size: 14px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; }
          .reports-distribution-row { display: grid; gap: 12px; margin-top: 18px; }
          .reports-distribution-copy { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }
          .reports-distribution-copy strong { color: #162032; font-size: 17px; }
          .reports-distribution-copy span, .reports-empty-note { color: #6d7b8d; font-size: 13px; }
          .reports-distribution-visual { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; }
          .reports-distribution-track { height: 10px; border-radius: 999px; background: #e7ecf0; overflow: hidden; }
          .reports-distribution-fill { height: 100%; border-radius: inherit; }
          .reports-distribution-fill.teal { background: linear-gradient(90deg, #5fdad8 0%, #0c8f97 100%); }
          .reports-distribution-fill.navy { background: linear-gradient(90deg, #9eb6df 0%, #36517f 100%); }
          .reports-distribution-visual em { color: #344154; font-size: 13px; font-style: normal; font-weight: 700; }
          .reports-priority-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 28px; }
          .reports-priority-card { padding: 20px; border-radius: 22px; background: linear-gradient(160deg, #f8fafc 0%, #eef4f7 100%); border: 1px solid #eaf0f2; }
          .reports-priority-card span { color: #57657a; font-size: 12px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; }
          .reports-priority-card strong { display: block; margin-top: 14px; color: #13213a; font-size: 34px; line-height: 1; }
          .reports-priority-card small { display: block; margin-top: 10px; color: #6c798b; font-size: 13px; }
          .reports-notes-panel { display: grid; gap: 12px; margin-top: 18px; }
          .reports-note-item { padding: 14px 16px; border-radius: 16px; background: #ffffff; color: #3c485a; font-size: 14px; line-height: 1.6; border: 1px solid #edf1f4; }
          .reports-table-card { overflow: hidden; }
          .reports-table-head, .reports-table-row { display: grid; grid-template-columns: 2fr 0.85fr 1fr 0.8fr 0.85fr 0.85fr; gap: 18px; align-items: center; }
          .reports-table-head.recent, .reports-table-row.recent { grid-template-columns: 1.1fr 0.8fr 1.1fr 0.9fr 0.4fr 0.6fr; }
          .reports-table-head { margin-top: 24px; padding: 18px 0; border-top: 1px solid #edf1f4; border-bottom: 1px solid #edf1f4; color: #4f5b6e; font-size: 12px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; }
          .reports-table-body { display: grid; }
          .reports-table-row { padding: 20px 0; border-bottom: 1px solid #eef2f4; color: #182235; font-size: 15px; }
          .reports-test-cell { display: grid; grid-template-columns: 8px 1fr; gap: 14px; align-items: start; }
          .reports-test-cell i { display: inline-block; width: 6px; height: 24px; border-radius: 999px; margin-top: 4px; background: #8edfd8; }
          .reports-test-cell i.warning { background: #dfb558; }
          .reports-test-cell i.critical { background: #d42a38; }
          .reports-test-cell strong, .reports-report-pill strong { display: block; color: #101928; font-size: 20px; line-height: 1.2; }
          .reports-test-cell span, .reports-report-pill span { display: block; margin-top: 4px; color: #677587; font-size: 13px; }
          .reports-status-pill { display: inline-flex; align-items: center; justify-content: center; min-width: 100px; padding: 8px 12px; border-radius: 999px; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
          .reports-status-pill.good { background: rgba(13, 143, 151, 0.12); color: #0d868f; }
          .reports-status-pill.warning { background: rgba(212, 165, 71, 0.14); color: #9d6f11; }
          .reports-status-pill.critical { background: rgba(210, 37, 50, 0.12); color: #c12835; }
          .reports-status-pill.neutral { background: rgba(30, 45, 77, 0.08); color: #1b2944; }
          .reports-report-pill { display: grid; gap: 2px; }
          .reports-empty-state { display: grid; place-items: center; min-height: 220px; color: #6e7b8c; font-size: 15px; text-align: center; }
          .reports-empty-state.table { min-height: 120px; }
          @media (max-width: 1480px) {
            .reports-metric-grid, .reports-secondary-grid, .reports-demographics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .reports-table-head, .reports-table-row { grid-template-columns: 1.5fr 0.8fr 0.9fr 0.8fr 0.8fr 0.9fr; }
          }
          @media (max-width: 1200px) {
            .reports-title-row, .reports-filter-foot, .reports-primary-grid, .reports-secondary-grid { grid-template-columns: 1fr; display: grid; }
            .reports-hero-actions { justify-content: flex-start; flex-wrap: wrap; }
            .reports-filter-grid, .reports-metric-grid, .reports-demographics-grid { grid-template-columns: 1fr; }
          }
          @media (max-width: 860px) {
            .reports-table-head, .reports-table-head.recent { display: none; }
            .reports-table-row, .reports-table-row.recent { grid-template-columns: 1fr; gap: 10px; }
            .reports-priority-grid { grid-template-columns: 1fr; }
          }
        `}</style>
      </div>
    </AppShell>
  );
}
