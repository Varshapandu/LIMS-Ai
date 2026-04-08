"use client";

import { openBlobInNewTab } from "./browser-file";
import { getTestReferenceMetadata, resolveDisplayReferenceRange } from "./test-reference";
import { deriveAbnormalFlag } from "./report-flags";

type ReportPatientHistory = {
  diagnosis?: string | null;
  medication?: string | null;
  recent_notes?: string | null;
};

type ReportClinicalContext = {
  last_review_at?: string | null;
};

type ReportAnalyte = {
  order_test_id: string;
  test_code: string;
  analyte_name: string;
  service_category?: string | null;
  method_name?: string | null;
  result_text?: string | null;
  numeric_value?: string | null;
  unit?: string | null;
  reference_range_text?: string | null;
  abnormal_flag?: string | null;
  critical_flag: boolean;
  status_label: string;
};

type ApprovalReportCase = {
  visit_number: string;
  patient_id: string;
  patient_name: string;
  age_years?: number | null;
  sex?: string | null;
  case_label: string;
  analysis_title: string;
  patient_history: ReportPatientHistory;
  clinical_context: ReportClinicalContext;
  analytes: ReportAnalyte[];
  doctor_name: string;
  doctor_role: string;
  signature_enabled: boolean;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return new Date().toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDemographics(ageYears?: number | null, sex?: string | null) {
  const ageLabel = ageYears !== null && ageYears !== undefined ? `${ageYears} Y` : "Age not captured";
  const normalizedSex = sex?.trim();
  const sexLabel = normalizedSex ? normalizedSex.replace(/^./, (value) => value.toUpperCase()) : "Sex not captured";
  return `${ageLabel} / ${sexLabel}`;
}

function formatResultValue(item: ReportAnalyte, unit?: string | null) {
  const raw = item.numeric_value || item.result_text || "--";
  const normalized = raw.toLowerCase().replace(/[/-]/g, " ").replace(/\s+/g, " ").trim();
  const isNarrative =
    (item.service_category || "").toLowerCase() === "radiology" ||
    (item.service_category || "").toLowerCase() === "cardiology" ||
    (item.method_name || "").toLowerCase().includes("narrative") ||
    (item.method_name || "").toLowerCase().includes("specialist");

  if (isNarrative && ["done", "completed", "complete", "ok", "normal study"].includes(normalized)) {
    return "Narrative impression pending";
  }

  return raw !== "--" && unit ? `${raw} ${unit}` : raw;
}

function resolveReferenceText(item: ReportAnalyte, approvalCase: ApprovalReportCase) {
  const metadata = getTestReferenceMetadata(item.analyte_name, item.service_category || "laboratory");
  return (
    resolveDisplayReferenceRange(
      item.reference_range_text || metadata.reference_range_text,
      approvalCase.sex,
      approvalCase.age_years,
    ) || (item.service_category === "radiology" || item.service_category === "cardiology" ? "Narrative impression" : "Not configured")
  );
}

function resolveUnit(item: ReportAnalyte) {
  const metadata = getTestReferenceMetadata(item.analyte_name, item.service_category || "laboratory");
  return item.unit || metadata.unit || null;
}

function resolveMethod(item: ReportAnalyte) {
  const metadata = getTestReferenceMetadata(item.analyte_name, item.service_category || "laboratory");
  return item.method_name || metadata.method_name || "Analyzer Entry";
}

function resolveFlagLabel(item: ReportAnalyte, referenceText?: string | null) {
  const derivedFlag = deriveAbnormalFlag({
    numericValue: item.numeric_value,
    resultText: item.result_text,
    abnormalFlag: item.abnormal_flag,
    referenceRangeText: item.reference_range_text || referenceText,
  });

  if (item.critical_flag && derivedFlag === "HIGH") return "CRITICAL HIGH";
  if (item.critical_flag && derivedFlag === "LOW") return "CRITICAL LOW";
  if (item.critical_flag && derivedFlag === "POSITIVE") return "CRITICAL POSITIVE";
  if (item.critical_flag) return "CRITICAL";
  if (derivedFlag === "HIGH") return "HIGH";
  if (derivedFlag === "LOW") return "LOW";
  if (derivedFlag === "POSITIVE") return "POSITIVE";
  if (derivedFlag === "ABNORMAL") return "ABNORMAL";
  return "NORMAL";
}

function buildReportHtml(approvalCase: ApprovalReportCase, doctorNote: string) {
  const generatedAt = formatDateTime(approvalCase.clinical_context.last_review_at);
  const analyteRows = approvalCase.analytes
    .map((item) => {
      const unit = resolveUnit(item);
      const resultValue = formatResultValue(item, unit);
      const referenceText = resolveReferenceText(item, approvalCase);
      const derivedFlag = deriveAbnormalFlag({
        numericValue: item.numeric_value,
        resultText: item.result_text,
        abnormalFlag: item.abnormal_flag,
        referenceRangeText: item.reference_range_text || referenceText,
      });
      const isAbnormal = Boolean(derivedFlag) || item.critical_flag;
      const flag = resolveFlagLabel(item, referenceText);
      const method = resolveMethod(item);

      return `
        <tr>
          <td>
            <div class="test-name">${escapeHtml(item.analyte_name)}</div>
            <div class="test-code">${escapeHtml(item.test_code)} • ${escapeHtml(method)}</div>
          </td>
          <td class="result-cell ${isAbnormal ? "abnormal" : ""}">${escapeHtml(resultValue)}</td>
          <td>${escapeHtml(referenceText)}</td>
          <td class="flag-cell ${isAbnormal ? "abnormal" : ""}">${escapeHtml(flag)}</td>
          <td>${escapeHtml(item.status_label)}</td>
        </tr>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Lab Report - ${escapeHtml(approvalCase.visit_number)}</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #122033;
        --muted: #5d6878;
        --line: #d8dee7;
        --panel: #f6f8fb;
        --accent: #0b8d92;
        --alert: #b11f2a;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: #eef3f7;
        color: var(--ink);
        font-family: "Segoe UI", Arial, sans-serif;
      }

      .sheet {
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        background: #ffffff;
        padding: 18mm 14mm 16mm;
      }

      .report-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        border-bottom: 2px solid var(--ink);
        padding-bottom: 12px;
      }

      .brand {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .brand-mark {
        font-size: 40px;
        font-weight: 900;
        letter-spacing: -0.04em;
      }

      .brand-mark .td {
        color: var(--accent);
      }

      .brand-mark .ai {
        color: #c62d2f;
      }

      .brand-subtitle {
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      .report-title-wrap {
        text-align: right;
      }

      .report-title {
        margin: 0;
        font-size: 28px;
        font-weight: 900;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .report-meta {
        margin-top: 8px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }

      .section-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 16px;
      }

      .info-card {
        border: 1px solid var(--line);
        background: var(--panel);
        padding: 12px;
      }

      .card-title {
        margin: 0 0 10px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .info-grid {
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: 8px 12px;
        font-size: 13px;
      }

      .info-grid .label {
        color: var(--muted);
      }

      .info-grid .value {
        font-weight: 700;
      }

      .analysis-banner {
        margin-top: 16px;
        border: 1px solid var(--line);
        background: linear-gradient(90deg, #f8f4ec 0%, #eef8f7 100%);
        padding: 12px 14px;
      }

      .analysis-banner h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 900;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .report-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 14px;
      }

      .report-table thead th {
        padding: 10px 12px;
        border-top: 2px solid var(--ink);
        border-bottom: 1px solid var(--ink);
        text-align: left;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .report-table tbody td {
        padding: 12px;
        border-bottom: 1px solid var(--line);
        vertical-align: top;
        font-size: 13px;
        line-height: 1.45;
      }

      .test-name {
        font-size: 16px;
        font-weight: 800;
      }

      .test-code {
        margin-top: 4px;
        color: var(--muted);
        font-size: 11px;
      }

      .result-cell,
      .flag-cell {
        font-weight: 700;
      }

      .result-cell.abnormal,
      .flag-cell.abnormal {
        color: var(--alert);
        font-weight: 900;
      }

      .comments {
        margin-top: 16px;
        border: 1px solid var(--line);
        padding: 12px 14px;
        background: #fcfcfd;
      }

      .comments-body {
        margin-top: 8px;
        white-space: pre-wrap;
        font-size: 13px;
        line-height: 1.65;
      }

      .signature-row {
        display: grid;
        grid-template-columns: 1fr 240px;
        gap: 16px;
        align-items: end;
        margin-top: 36px;
      }

      .signature-note {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.6;
      }

      .signature-box {
        border-top: 1px solid var(--ink);
        padding-top: 10px;
        text-align: center;
      }

      .signature-script {
        min-height: 34px;
        color: var(--accent);
        font-family: "Segoe Script", "Brush Script MT", cursive;
        font-size: 30px;
        line-height: 1.1;
      }

      .signature-name {
        margin-top: 6px;
        font-size: 14px;
        font-weight: 800;
      }

      .signature-role,
      .signature-meta {
        color: var(--muted);
        font-size: 11px;
      }

      @page {
        size: A4;
        margin: 12mm;
      }

      @media print {
        body {
          background: #ffffff;
        }

        .sheet {
          width: auto;
          min-height: auto;
          margin: 0;
          padding: 0;
        }
      }
    </style>
    <script>
      window.addEventListener("load", () => {
        window.setTimeout(() => {
          window.print();
        }, 150);
      });
    </script>
  </head>
  <body>
    <main class="sheet">
      <header class="report-header">
        <div class="brand">
          <div class="brand-mark"><span class="td">TD</span><span>|</span><span class="ai">ai</span></div>
          <div class="brand-subtitle">Clinical Laboratory Report</div>
        </div>
        <div class="report-title-wrap">
          <h1 class="report-title">Final Lab Report</h1>
          <div class="report-meta">
            Visit No: ${escapeHtml(approvalCase.visit_number)}<br />
            Case Ref: ${escapeHtml(approvalCase.case_label)}<br />
            Generated: ${escapeHtml(generatedAt)}
          </div>
        </div>
      </header>

      <section class="section-grid">
        <article class="info-card">
          <h3 class="card-title">Patient Details</h3>
          <div class="info-grid">
            <div class="label">Patient Name</div><div class="value">${escapeHtml(approvalCase.patient_name)}</div>
            <div class="label">Patient ID</div><div class="value">${escapeHtml(approvalCase.patient_id)}</div>
            <div class="label">Age / Sex</div><div class="value">${escapeHtml(formatDemographics(approvalCase.age_years, approvalCase.sex))}</div>
            <div class="label">Diagnosis</div><div class="value">${escapeHtml(approvalCase.patient_history.diagnosis || "Not documented")}</div>
            <div class="label">Medication</div><div class="value">${escapeHtml(approvalCase.patient_history.medication || "Not documented")}</div>
          </div>
        </article>
        <article class="info-card">
          <h3 class="card-title">Review Summary</h3>
          <div class="info-grid">
            <div class="label">Panel</div><div class="value">${escapeHtml(approvalCase.analysis_title)}</div>
            <div class="label">Reviewed By</div><div class="value">${escapeHtml(approvalCase.doctor_name)}</div>
            <div class="label">Role</div><div class="value">${escapeHtml(approvalCase.doctor_role)}</div>
            <div class="label">Recent Notes</div><div class="value">${escapeHtml(approvalCase.patient_history.recent_notes || "No note recorded")}</div>
          </div>
        </article>
      </section>

      <section class="analysis-banner">
        <h2>${escapeHtml(approvalCase.analysis_title)}</h2>
      </section>

      <table class="report-table">
        <thead>
          <tr>
            <th>Test / Method</th>
            <th>Result</th>
            <th>Reference Range</th>
            <th>Flag</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${analyteRows}</tbody>
      </table>

      <section class="comments">
        <h3 class="card-title">Doctor Comment</h3>
        <div class="comments-body">${escapeHtml(doctorNote.trim() || "No additional clinical assessment provided.")}</div>
      </section>

      <section class="signature-row">
        <div class="signature-note">
          This report is electronically verified and intended for clinical interpretation by authorized medical personnel.
          Abnormal or critical results are emphasized in bold for rapid review.
        </div>
        <div class="signature-box">
          <div class="signature-script">${approvalCase.signature_enabled ? escapeHtml(approvalCase.doctor_name) : ""}</div>
          <div class="signature-name">${escapeHtml(approvalCase.doctor_name)}</div>
          <div class="signature-role">${escapeHtml(approvalCase.doctor_role)}</div>
          <div class="signature-meta">${approvalCase.signature_enabled ? "Digitally signed laboratory approval" : "Signature unavailable"}</div>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

export function exportApprovalReportPdf(approvalCase: ApprovalReportCase, doctorNote: string) {
  if (typeof window === "undefined") {
    return;
  }

  const html = buildReportHtml(approvalCase, doctorNote);
  const blob = new Blob([html], { type: "text/html" });
  const opened = openBlobInNewTab(blob);
  if (!opened) {
    throw new Error("Popup blocked. Please allow popups to export the report PDF.");
  }
}
