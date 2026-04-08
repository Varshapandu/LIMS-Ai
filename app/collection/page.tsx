"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SVGProps } from "react";

import { AppShell } from "../components/app-shell";
import { apiRequest } from "../lib/api";
import { downloadBlob } from "../lib/browser-file";
import { useAuthRedirect } from "../lib/use-auth-redirect";
import { loadWorkflowBundle, updateWorkflowBundle, WORKFLOW_UPDATED_EVENT } from "../lib/workflow-storage";

type CollectionWorklistItem = {
  specimen_id: string;
  specimen_number: string;
  visit_number: string;
  patient_id: string;
  patient_name: string;
  test_code: string;
  test_name: string;
  sample_type: string;
  container_type: string;
  barcode_value: string;
  specimen_status: string;
  rejection_reason?: string | null;
  tat_due_at?: string | null;
};

type LocalCollectionBundle = {
  visit_number: string;
  patient_name: string;
  items: CollectionWorklistItem[];
};

function IconBase({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

function ScanIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 7V5a1 1 0 0 1 1-1h2" />
      <path d="M18 4h2a1 1 0 0 1 1 1v2" />
      <path d="M21 17v2a1 1 0 0 1-1 1h-2" />
      <path d="M7 20H5a1 1 0 0 1-1-1v-2" />
      <path d="M8 7v10" />
      <path d="M11 7v10" />
      <path d="M14 7v10" />
      <path d="M17 7v10" />
    </IconBase>
  );
}

function QueueIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="8" cy="9" r="2.5" />
      <circle cx="16" cy="8" r="2" />
      <path d="M4.5 18a4 4 0 0 1 7 0" />
      <path d="M13 16.5a3.5 3.5 0 0 1 6 0" />
    </IconBase>
  );
}

function AlertIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 4v9" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.8 4.8 18a1 1 0 0 0 .9 1.4h12.6a1 1 0 0 0 .9-1.4L13.7 3.8a1 1 0 0 0-1.9 0Z" />
    </IconBase>
  );
}

function GaugeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M5 16a7 7 0 1 1 14 0" />
      <path d="m12 12 3-3" />
      <path d="M12 12h.01" />
    </IconBase>
  );
}

function DropletIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 3s5 5.2 5 9a5 5 0 1 1-10 0c0-3.8 5-9 5-9Z" />
    </IconBase>
  );
}

function TubeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="7" y="4" width="10" height="16" rx="2" />
      <path d="M7 8h10" />
      <path d="M10 12h4" />
    </IconBase>
  );
}

function HistoryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 12a8 8 0 1 0 2.3-5.7" />
      <path d="M4 5v5h5" />
    </IconBase>
  );
}

function ExportMiniIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 4v10" />
      <path d="m8 8 4-4 4 4" />
      <path d="M6 14v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4" />
    </IconBase>
  );
}

function normalizeStatus(status: string) {
  return status.toLowerCase();
}

function getStatusLabel(status: string) {
  const normalized = normalizeStatus(status);
  if (normalized === "received" || normalized === "collected") {
    return "Collected";
  }
  if (normalized === "rejected") {
    return "Rejected";
  }
  return "Pending";
}

function getSampleIcon(sampleType: string) {
  const normalized = sampleType.toLowerCase();
  if (normalized.includes("blood") || normalized.includes("serum") || normalized.includes("plasma")) {
    return DropletIcon;
  }
  return TubeIcon;
}

function syncWorkflowStatuses(items: CollectionWorklistItem[]) {
  updateWorkflowBundle((current) => {
    if (!current) {
      return current;
    }

    const itemMap = new Map(items.map((item) => [item.barcode_value, item]));
    return {
      ...current,
      items: current.items.map((item) => {
        const matched = itemMap.get(item.barcode_value);
        if (!matched) {
          return item;
        }
        return {
          ...item,
          specimen_status: matched.specimen_status,
          rejection_reason: matched.rejection_reason ?? null,
          tat_due_at: matched.tat_due_at ?? item.tat_due_at ?? null,
        };
      }),
    };
  });
}

export default function CollectionPage() {
  const router = useRouter();
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const [visitFilter, setVisitFilter] = useState("");
  const [barcodeFilter, setBarcodeFilter] = useState("");
  const [statusMessage, setStatusMessage] = useState("Load a visit or scan a barcode to activate the collection queue.");
  const [loading, setLoading] = useState(false);
  const [savingBarcode, setSavingBarcode] = useState<string | null>(null);
  const [items, setItems] = useState<CollectionWorklistItem[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const isAuthenticated = useAuthRedirect();

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const visitFromQuery = params.get("visit") || "";
    const barcodeFromQuery = params.get("barcode") || "";
    const savedBundle = loadWorkflowBundle();

    if (savedBundle) {
      try {
        setVisitFilter(visitFromQuery || savedBundle.visit_number);
        setBarcodeFilter(barcodeFromQuery);
        setItems(savedBundle.items);
        setStatusMessage(`Loaded ${savedBundle.items.length} queued specimen items for ${visitFromQuery || savedBundle.visit_number}.`);
      } catch {
        setItems([]);
      }
    } else {
      setVisitFilter(visitFromQuery);
      setBarcodeFilter(barcodeFromQuery);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const visit = params.get("visit");
    const barcode = params.get("barcode");
    if (visit || barcode) {
      void loadWorklist(visit || "", barcode || "");
    } else if (items.length === 0) {
      // Auto-load all specimens if no filters are set and no prior data is loaded
      void loadWorklist("", "");
    }
  }, []);

  useEffect(() => {
    const handleWorkflowUpdated = () => {
      const savedBundle = loadWorkflowBundle();
      if (!savedBundle) {
        return;
      }
      setVisitFilter((current) => current || savedBundle.visit_number);
      setItems(savedBundle.items);
    };

    window.addEventListener(WORKFLOW_UPDATED_EVENT, handleWorkflowUpdated);
    return () => window.removeEventListener(WORKFLOW_UPDATED_EVENT, handleWorkflowUpdated);
  }, []);

  const metrics = useMemo(() => {
    const pending = items.filter((item) => !["received", "collected", "rejected"].includes(normalizeStatus(item.specimen_status))).length;
    const collected = items.filter((item) => ["received", "collected"].includes(normalizeStatus(item.specimen_status))).length;
    const rejected = items.filter((item) => normalizeStatus(item.specimen_status) === "rejected").length;
    const avgCollectionMinutes = collected > 0 ? (collected * 4.2) / Math.max(collected, 1) : 0;

    return {
      total: items.length,
      pending,
      collected,
      rejected,
      avgCollectionMinutes,
    };
  }, [items]);

  async function loadWorklist(visitArg = visitFilter, barcodeArg = barcodeFilter) {
    if (!visitArg.trim() && !barcodeArg.trim()) {
      setStatusMessage("Enter a visit number or barcode to load specimens.");
      return;
    }

    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (visitArg.trim()) {
        query.set("visit_number", visitArg.trim());
      }
      if (barcodeArg.trim()) {
        query.set("barcode_value", barcodeArg.trim());
      }
      const response = await apiRequest<CollectionWorklistItem[]>(`/api/specimens/worklist?${query.toString()}`);
      setItems(response);
      syncWorkflowStatuses(response);
      setStatusMessage(response.length > 0 ? `Live queue synced from backend for ${visitArg || barcodeArg}.` : "No specimen items found for this filter.");
    } catch {
      const savedBundle = loadWorkflowBundle();
      if (savedBundle) {
        const filtered = savedBundle.items.filter((item) => {
          const visitMatch = !visitArg.trim() || item.visit_number.toLowerCase().includes(visitArg.trim().toLowerCase());
          const barcodeMatch = !barcodeArg.trim() || item.barcode_value.toLowerCase().includes(barcodeArg.trim().toLowerCase());
          return visitMatch && barcodeMatch;
        });
        setItems(filtered);
        setStatusMessage(filtered.length > 0 ? `Loaded ${filtered.length} queue items in local demo mode.` : "No local collection items matched this search.");
      } else {
        setItems([]);
        setStatusMessage("Backend queue is unavailable and there is no local collection data yet.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function markCollected(target: CollectionWorklistItem) {
    setSavingBarcode(target.barcode_value);
    try {
      await apiRequest("/api/specimens/status", {
        method: "PATCH",
        body: JSON.stringify({
          barcode_value: target.barcode_value,
          specimen_status: "received",
          rejection_reason: null,
        }),
      });
      const nextItems = items.map((item) =>
          item.barcode_value === target.barcode_value
            ? { ...item, specimen_status: "received", rejection_reason: null }
            : item,
        );
      setItems(nextItems);
      syncWorkflowStatuses(nextItems);
      setStatusMessage(`Specimen ${target.barcode_value} was marked collected in the backend queue.`);
    } catch {
      const nextItems = items.map((item) =>
        item.barcode_value === target.barcode_value
          ? { ...item, specimen_status: "received", rejection_reason: null }
          : item,
      );
      setItems(nextItems);
      syncWorkflowStatuses(nextItems);
      setStatusMessage(`Specimen ${target.barcode_value} was updated locally in demo mode.`);
    } finally {
      setSavingBarcode(null);
    }
  }

  function exportQueue() {
    if (items.length === 0) {
      setStatusMessage("There is no active queue to export yet.");
      return;
    }

    const header = ["Patient", "Patient ID", "Visit", "Test", "Sample Type", "Barcode", "Status"];
    const rows = items.map((item) => [
      item.patient_name,
      item.patient_id,
      item.visit_number,
      item.test_name,
      `${item.sample_type} (${item.container_type})`,
      item.barcode_value,
      getStatusLabel(item.specimen_status),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value).split('"').join('""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, `collection-queue-${visitFilter || "active"}.csv`);
    setStatusMessage("Collection queue exported as CSV.");
  }

  return (
    <AppShell
      overline="Inventory & Workflow"
      title="Specimen Collection"
      action={
        <button className="collection-scan-button" type="button" onClick={() => {
          setShowFilters(true);
          barcodeInputRef.current?.focus();
          setStatusMessage("Scanner input is ready. Paste or scan a barcode to filter the live queue.");
        }}>
          <ScanIcon className="collection-scan-icon" />
          <span>Scan Barcode</span>
        </button>
      }
    >
      <section className="collection-hero-grid">
        <article className="collection-metric-card">
          <div className="collection-metric-head">
            <div>
              <div className="collection-metric-label">Queue Density</div>
              <div className="collection-metric-value">{String(metrics.total).padStart(2, "0")} <span>Samples</span></div>
            </div>
            <div className="collection-metric-icon-wrap neutral"><QueueIcon className="collection-metric-icon" /></div>
          </div>
          <div className="collection-metric-bar"><span style={{ width: `${Math.min(100, metrics.total * 12)}%` }} /></div>
        </article>

        <article className="collection-metric-card">
          <div className="collection-metric-head">
            <div>
              <div className="collection-metric-label">Priority Tasks</div>
              <div className="collection-metric-value alert">{String(metrics.pending).padStart(2, "0")} <span>STAT</span></div>
            </div>
            <div className="collection-metric-icon-wrap danger"><AlertIcon className="collection-metric-icon" /></div>
          </div>
          <div className="collection-metric-foot danger">Immediate action required</div>
        </article>

        <article className="collection-metric-card">
          <div className="collection-metric-head">
            <div>
              <div className="collection-metric-label">Avg Collection Time</div>
              <div className="collection-metric-value success">{metrics.avgCollectionMinutes.toFixed(1)} <span>Min</span></div>
            </div>
            <div className="collection-metric-icon-wrap soft"><GaugeIcon className="collection-metric-icon" /></div>
          </div>
          <div className="collection-metric-foot success">Live once collection timestamps are recorded</div>
        </article>
      </section>

      <section className="collection-queue-panel panel">
        <div className="collection-queue-header">
          <div>
            <div className="panel-title">Active Queue</div>
            <div className="panel-copy">Specimens generated from billing are synced here for collection and barcode tracking.</div>
          </div>
          <div className="collection-queue-actions">
            <button className="collection-link-button" type="button" onClick={exportQueue}>
              <ExportMiniIcon className="collection-mini-icon" />
              <span>Export CSV</span>
            </button>
            <button className="collection-link-button dark" type="button" onClick={() => setShowFilters((current) => !current)}>
              Filters
            </button>
          </div>
        </div>

        {showFilters ? (
          <div className="collection-filter-strip">
            <div className="field">
              <label className="label">Visit Number</label>
              <input className="input" value={visitFilter} onChange={(event) => setVisitFilter(event.target.value)} placeholder="VIS-..." />
            </div>
            <div className="field">
              <label className="label">Barcode ID</label>
              <input ref={barcodeInputRef} className="input" value={barcodeFilter} onChange={(event) => setBarcodeFilter(event.target.value)} placeholder="BC-..." />
            </div>
            <button className="secondary-btn collection-filter-submit" type="button" onClick={() => void loadWorklist()} disabled={loading}>
              {loading ? "Loading..." : "Load Queue"}
            </button>
          </div>
        ) : null}

        <div className="collection-status-line">{statusMessage}</div>

        <div className="collection-queue-table">
          <div className="collection-queue-head">
            <span>Test Details (Patient/ID)</span>
            <span>Sample Type</span>
            <span>Barcode ID</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          {items.length > 0 ? (
            items.map((item) => {
              const SampleIcon = getSampleIcon(item.sample_type);
              const normalizedStatus = normalizeStatus(item.specimen_status);
              const isCollected = normalizedStatus === "received" || normalizedStatus === "collected";
              const statusClass = normalizedStatus === "rejected" ? "rejected" : isCollected ? "collected" : "pending";

              return (
                <div className={`collection-queue-row ${statusClass}`} key={item.barcode_value}>
                  <div className="collection-patient-block">
                    <strong>{item.patient_name}</strong>
                    <span>{item.patient_id}</span>
                    <small>{item.test_name}</small>
                  </div>

                  <div className="collection-sample-block">
                    <SampleIcon className="collection-sample-icon" />
                    <div>
                      <strong>{item.sample_type}</strong>
                      <span>{item.container_type}</span>
                    </div>
                  </div>

                  <div className="collection-barcode-tag">{item.barcode_value}</div>

                  <div className={`collection-status-badge ${statusClass}`}>{getStatusLabel(item.specimen_status)}</div>

                  <div className="collection-action-cell">
                    <button
                      className={`collection-collect-button${isCollected ? " disabled" : ""}`}
                      type="button"
                      disabled={isCollected || savingBarcode === item.barcode_value}
                      onClick={() => void markCollected(item)}
                    >
                      {savingBarcode === item.barcode_value ? "Saving..." : isCollected ? "Collected" : "Collect"}
                    </button>
                    <button className="collection-history-button" type="button" onClick={() => setBarcodeFilter(item.barcode_value)} aria-label={`Use ${item.barcode_value} as active barcode filter`}>
                      <HistoryIcon className="collection-history-icon" />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-state collection-empty-state">No specimen queue loaded yet. Generate a bill first or load a visit from the backend.</div>
          )}
        </div>
      </section>

      <section className="collection-bottom-grid">
        <article className="panel collection-reference-card">
          <div className="collection-section-kicker">Staff Quick Reference</div>
          <div className="collection-reference-list">
            <div className="collection-reference-item"><span>01</span><p>Verify patient identity with two unique identifiers before label generation.</p></div>
            <div className="collection-reference-item"><span>02</span><p>Ensure collection tubes are inverted 5-8 times immediately after phlebotomy.</p></div>
            <div className="collection-reference-item"><span>03</span><p>Affix barcode labels vertically, ensuring the human-readable text is visible.</p></div>
          </div>
        </article>

        <article className="panel collection-scanner-card">
          <div className="collection-scanner-visual">
            <div className="collection-scanner-vial" />
            <div className="collection-scanner-reflection" />
          </div>
          <div className="collection-scanner-copy">
            <div className="overline collection-inline-overline">Scanning System</div>
            <h3>Ready for Scan</h3>
            <p>Connect a compatible USB or Bluetooth scanner to instantly update the queue status and print labels.</p>
            <button className="collection-settings-link" type="button" onClick={() => {
              setShowFilters(true);
              barcodeInputRef.current?.focus();
            }}>
              Hardware Settings
            </button>
          </div>
        </article>
      </section>
    </AppShell>
  );
}



