"use client";

import "./approvals.css";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SVGProps } from "react";

import { AppShell } from "../components/app-shell";
import { ExportIcon } from "../components/icons";
import { apiRequest } from "../lib/api";
import { loadBillingData } from "../lib/billing-storage";
import { deriveAbnormalFlag } from "../lib/report-flags";
import { exportApprovalReportPdf } from "../lib/report-export";
import { getTestReferenceMetadata, resolveDisplayReferenceRange } from "../lib/test-reference";
import { useAuthRedirect } from "../lib/use-auth-redirect";
import { loadWorkflowBundle, saveWorkflowBundle, updateWorkflowBundle, WORKFLOW_UPDATED_EVENT, type WorkflowBundle } from "../lib/workflow-storage";

type ApprovalCase = {
  visit_number: string;
  patient_id: string;
  patient_name: string;
  age_years?: number | null;
  sex?: string | null;
  case_label: string;
  analysis_title: string;
  critical_alerts: number;
  patient_history: {
    diagnosis?: string | null;
    medication?: string | null;
    recent_notes?: string | null;
  };
  clinical_context: {
    fasting_status: string;
    fasting_note: string;
    last_review_at?: string | null;
    last_review_note: string;
  };
  analytes: Array<{
    order_test_id: string;
    test_code: string;
    analyte_name: string;
    service_category?: string | null;
    method_name?: string | null;
    result_status: string;
    result_text?: string | null;
    numeric_value?: string | null;
    unit?: string | null;
    reference_range_text?: string | null;
    abnormal_flag?: string | null;
    critical_flag: boolean;
    status_label: string;
    status_tone: string;
  }>;
  glucose_trend: Array<{
    month: string;
    value: string;
  }>;
  interventions: Array<{
    key: string;
    label: string;
    checked: boolean;
  }>;
  review_status: string;
  review_status_label: string;
  validation_pending: boolean;
  analysis_time_label: string;
  doctor_name: string;
  doctor_role: string;
  doctor_note?: string | null;
  signature_enabled: boolean;
  payment_status: string;
  due_amount: number;
};

type ApprovalActionResponse = {
  visit_number: string;
  approved_tests: number;
  visit_status: string;
  approved_at: string;
  action: string;
  doctor_note?: string | null;
  report_number?: string | null;
  report_emailed?: boolean;
  report_emailed_to?: string | null;
  report_email_error?: string | null;
  message?: string | null;
};

type EmailDeliveryState = {
  sent: boolean;
  recipient: string | null;
  error: string | null;
  updatedAt: string | null;
};

type ApprovalAnalyte = ApprovalCase["analytes"][number];

function IconBase({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

function SparkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 3v6" />
      <path d="M12 15v6" />
      <path d="M5.5 6.5 9 10" />
      <path d="m15 14 3.5 3.5" />
      <path d="M3 12h6" />
      <path d="M15 12h6" />
    </IconBase>
  );
}

function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M3 10h18" />
      <path d="M8 14h4" />
    </IconBase>
  );
}

function TimerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v5l3 2" />
      <path d="M9 3h6" />
    </IconBase>
  );
}

const fallbackCase: ApprovalCase = {
  visit_number: "",
  patient_id: "",
  patient_name: "No active case",
  age_years: null,
  sex: null,
  case_label: "#--",
  analysis_title: "Current Analysis: Pending",
  critical_alerts: 0,
  patient_history: {
    diagnosis: "Not documented",
    medication: "Not documented",
    recent_notes: "No backend or local approval case is available yet.",
  },
  clinical_context: {
    fasting_status: "Fasting Status",
    fasting_note: "Pending",
    last_review_at: null,
    last_review_note: "No analytical review yet",
  },
  analytes: [],
  glucose_trend: [
    { month: "MAY", value: "0" },
    { month: "JUN", value: "0" },
    { month: "JUL", value: "0" },
    { month: "AUG", value: "0" },
    { month: "SEP", value: "0" },
    { month: "OCT", value: "0" },
  ],
  interventions: [
    { key: "notify", label: "Immediate Physician Notification", checked: false },
    { key: "ketoacidosis", label: "Reflex Ketoacidosis Screening", checked: false },
    { key: "repeat", label: "Stat Repeat (Diff. Methodology)", checked: false },
    { key: "validation-note", label: "Add Clinical Validation Note", checked: false },
  ],
  review_status: "pending",
  review_status_label: "Validation Pending",
  validation_pending: true,
  analysis_time_label: "00h 00m (Stat)",
  doctor_name: "Lab Admin",
  doctor_role: "Admin",
  doctor_note: "",
  signature_enabled: true,
  payment_status: "pending",
  due_amount: 0,
};

function buildStatusFromWorkflowItem(item: WorkflowBundle["items"][number]) {
  if (!["received", "collected"].includes((item.specimen_status || "").toLowerCase())) {
    return { label: "Awaiting Specimen", tone: "pending" };
  }

  const derivedFlag = deriveAbnormalFlag({
    numericValue: item.numeric_value !== null && item.numeric_value !== undefined ? String(item.numeric_value) : null,
    resultText: item.result_text || null,
    abnormalFlag: item.abnormal_flag || null,
    referenceRangeText: item.reference_range_text || null,
  });

  if (item.critical_flag) {
    if (derivedFlag === "LOW") {
      return { label: "Critical Low", tone: "critical" };
    }
    if (derivedFlag === "HIGH") {
      return { label: "Critical High", tone: "critical" };
    }
    if (derivedFlag === "POSITIVE") {
      return { label: "Critical Positive", tone: "critical" };
    }
    return { label: "Critical Abnormal", tone: "critical" };
  }
  if (derivedFlag === "HIGH") {
    return { label: "High", tone: "critical" };
  }
  if (derivedFlag === "LOW") {
    return { label: "Low", tone: "critical" };
  }
  if (derivedFlag === "POSITIVE" || derivedFlag === "ABNORMAL") {
    return { label: derivedFlag === "POSITIVE" ? "Positive" : "Abnormal", tone: "critical" };
  }
  if ((item.result_status || "pending") === "approved") {
    return { label: "Approved", tone: "normal" };
  }
  if ((item.result_status || "pending") === "entered") {
    return { label: "Entered", tone: "normal" };
  }
  return { label: "Pending", tone: "pending" };
}

function hasStoredResult(item: Pick<WorkflowBundle["items"][number], "numeric_value" | "result_text">) {
  const hasNumericValue = item.numeric_value !== null && item.numeric_value !== undefined && String(item.numeric_value).trim() !== "";
  const hasTextValue = Boolean(item.result_text && item.result_text.trim());
  return hasNumericValue || hasTextValue;
}

function buildLocalApprovalCase(bundle: WorkflowBundle): ApprovalCase {
  const storedBill = loadBillingData().bills.find((bill) => bill.visit_number === bundle.visit_number) || null;
  const analytes = bundle.items.map((item) => {
    const status = buildStatusFromWorkflowItem(item);
    return {
      order_test_id: item.order_test_id || `${bundle.visit_number}-${item.test_code}`,
      test_code: item.test_code,
      analyte_name: item.test_name,
      service_category: item.service_category || "laboratory",
      method_name: item.method_name || null,
      result_status: item.result_status || "pending",
      result_text: item.result_text || null,
      numeric_value: item.numeric_value !== null && item.numeric_value !== undefined ? String(item.numeric_value) : null,
      unit: item.unit || null,
      reference_range_text: item.reference_range_text || null,
      abnormal_flag: item.abnormal_flag || null,
      critical_flag: item.critical_flag || false,
      status_label: status.label,
      status_tone: status.tone,
    };
  });

  const glucoseItem = analytes.find((item) => item.analyte_name.toLowerCase().includes("glucose"));
  const currentValue = glucoseItem?.numeric_value || "0";
  const criticalAlerts = analytes.filter((item) => item.critical_flag).length;
  const reviewComplete = analytes.length > 0 && analytes.every((item) => item.result_status === "approved");

  return {
    visit_number: bundle.visit_number,
    patient_id: bundle.patient.patient_id,
    patient_name: bundle.patient.patient_name,
    age_years: bundle.patient.age_years ?? null,
    sex: bundle.patient.sex ?? null,
    case_label: `#${bundle.visit_number}`,
    analysis_title: `Current Analysis: ${(bundle.items[0]?.sample_type || "Pending").toUpperCase()} PANEL`,
    critical_alerts: criticalAlerts,
    patient_history: {
      diagnosis: bundle.diagnosis || "Not documented",
      medication: bundle.medication || "Not documented",
      recent_notes: bundle.clinical_notes || "No clinical note entered yet.",
    },
    clinical_context: {
      fasting_status: "Fasting Status",
      fasting_note: glucoseItem ? "Review based on current analytical entry" : "No glucose study in current visit",
      last_review_at: bundle.updated_at || bundle.created_at || null,
      last_review_note: "Local persisted review case",
    },
    analytes,
    glucose_trend: [
      { month: "MAY", value: "0" },
      { month: "JUN", value: "0" },
      { month: "JUL", value: "0" },
      { month: "AUG", value: "0" },
      { month: "SEP", value: "0" },
      { month: "OCT", value: currentValue },
    ],
    interventions: [
      { key: "notify", label: "Immediate Physician Notification", checked: criticalAlerts > 0 },
      { key: "ketoacidosis", label: "Reflex Ketoacidosis Screening", checked: criticalAlerts > 0 && Boolean(glucoseItem) },
      { key: "repeat", label: "Stat Repeat (Diff. Methodology)", checked: false },
      { key: "validation-note", label: "Add Clinical Validation Note", checked: false },
    ],
    review_status: reviewComplete ? "finalized" : analytes.some((item) => item.result_status === "entered") ? "reviewing" : "pending",
    review_status_label: reviewComplete ? "Finalized" : "Validation Pending",
    validation_pending: !reviewComplete,
    analysis_time_label: "00h 00m (Stat)",
    doctor_name: "Lab Admin",
    doctor_role: "Admin",
    doctor_note: "",
    signature_enabled: true,
    payment_status: storedBill?.payment_status || "pending",
    due_amount: storedBill?.due_amount || 0,
  };
}

function syncBundleForApprovalAction(bundle: WorkflowBundle, action: "retest" | "approve" | "finalize", doctorNote: string) {
  return {
    ...bundle,
    clinical_notes: doctorNote || bundle.clinical_notes || null,
    items: bundle.items.map((item) => {
      if (action === "retest") {
        return item.result_status === "approved" ? { ...item, result_status: "entered" } : item;
      }

      if (["entered", "approved"].includes(item.result_status || "pending") || hasStoredResult(item)) {
        return { ...item, result_status: "approved" };
      }

      return item;
    }),
  };
}

function getAnalyteDisplayMetadata(item: ApprovalAnalyte, approvalCase: ApprovalCase) {
  const metadata = getTestReferenceMetadata(item.analyte_name, item.service_category || "laboratory");
  return {
    methodName: item.method_name || metadata.method_name || "Analyzer Entry",
    unit: item.unit || metadata.unit || null,
    referenceText:
      resolveDisplayReferenceRange(
        item.reference_range_text || metadata.reference_range_text,
        approvalCase.sex,
        approvalCase.age_years,
      ) || (item.service_category === "radiology" || item.service_category === "cardiology" ? "Narrative impression" : "Not configured"),
  };
}

function getDerivedAnalyteFlag(item: ApprovalAnalyte, approvalCase: ApprovalCase) {
  const metadata = getAnalyteDisplayMetadata(item, approvalCase);
  return deriveAbnormalFlag({
    numericValue: item.numeric_value || null,
    resultText: item.result_text || null,
    abnormalFlag: item.abnormal_flag || null,
    referenceRangeText: item.reference_range_text || metadata.referenceText,
  });
}

function formatCaseValue(item: ApprovalCase["analytes"][number], fallbackUnit?: string | null) {
  const raw = item.numeric_value || item.result_text || "--";
  const unit = item.unit || fallbackUnit;
  return `${raw}${raw !== "--" && unit ? ` ${unit}` : ""}`;
}

function formatReviewDate(value?: string | null) {
  if (!value) {
    return "Oct 14, 2023";
  }
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDemographics(ageYears?: number | null, sex?: string | null) {
  const ageLabel = ageYears !== null && ageYears !== undefined ? `${ageYears}Y` : "Age not captured";
  const normalizedSex = sex?.trim();
  const sexLabel = normalizedSex
    ? normalizedSex.replace(/^./, (value) => value.toUpperCase())
    : "Sex not captured";
  return `${ageLabel} / ${sexLabel}`;
}

function parseNumericValue(value?: string | null) {
  if (!value) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseReferenceBounds(referenceRangeText?: string | null) {
  if (!referenceRangeText) {
    return null;
  }
  const match = referenceRangeText.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (!match) {
    return null;
  }
  const low = Number(match[1]);
  const high = Number(match[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low === high) {
    return null;
  }
  return { low, high };
}

function formatNumericReading(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(value >= 100 ? 1 : 2).replace(/\.?0+$/, "");
}

function buildAnalyticsCardData(approvalCase: ApprovalCase, focusIndex: number) {
  const focus = approvalCase.analytes[focusIndex] || null;
  if (!focus) {
    return {
      mode: "empty" as const,
      title: "Case Insight",
      tag: "Awaiting Results",
      countLabel: "0 of 0",
    };
  }

  const metadata = getAnalyteDisplayMetadata(focus, approvalCase);
  const numericValue = parseNumericValue(focus.numeric_value);
  const bounds = parseReferenceBounds(metadata.referenceText);
  const displayValue = formatCaseValue(focus, metadata.unit);
  const countLabel = `${focusIndex + 1} of ${approvalCase.analytes.length}`;
  if (numericValue !== null && bounds) {
    const span = bounds.high - bounds.low;
    const lowerVisualBound = bounds.low - span;
    const upperVisualBound = bounds.high + span;
    const markerPercent = Math.max(
      0,
      Math.min(100, ((numericValue - lowerVisualBound) / (upperVisualBound - lowerVisualBound)) * 100),
    );
    const isLow = numericValue < bounds.low;
    const isHigh = numericValue > bounds.high;
    const deviation = isLow
      ? `${formatNumericReading(bounds.low - numericValue)} ${metadata.unit || ""}`.trim()
      : isHigh
        ? `${formatNumericReading(numericValue - bounds.high)} ${metadata.unit || ""}`.trim()
        : "0";
    const bandLabel = isLow ? "Below reference band" : isHigh ? "Above reference band" : "Within reference band";
    const interpretation = isLow
      ? `${focus.analyte_name} is below the lower reference limit of ${formatNumericReading(bounds.low)}${metadata.unit ? ` ${metadata.unit}` : ""}.`
      : isHigh
        ? `${focus.analyte_name} is above the upper reference limit of ${formatNumericReading(bounds.high)}${metadata.unit ? ` ${metadata.unit}` : ""}.`
        : `${focus.analyte_name} is currently within the expected reference interval for this patient.`;

    return {
      mode: "numeric" as const,
      title: `${focus.analyte_name} Extended Insight`,
      tag: `Current: ${displayValue}`,
      countLabel,
      focus,
      metadata,
      bounds,
      markerPercent,
      displayValue,
      bandLabel,
      deviation,
      interpretation,
    };
  }

  return {
    mode: "summary" as const,
    title: `${focus.analyte_name} Extended Insight`,
    tag: focus.status_label,
    countLabel,
    focus,
    metadata,
    displayValue,
    interpretation:
      numericValue !== null
        ? "A numeric result is present, but this analyte does not have a usable numeric reference interval configured yet."
        : "This analyte is best reviewed as a descriptive result, so the panel shows a focused summary instead of a misleading gauge.",
  };
}

function getDeliveryPresentation(approvalCase: ApprovalCase, emailDelivery: EmailDeliveryState) {
  if (emailDelivery.sent) {
    return {
      statusLabel: "Email Sent",
      statusClass: "approval-delivery-success",
      recipient: emailDelivery.recipient || "Recipient returned by backend",
      helper: null,
    };
  }

  if (emailDelivery.error) {
    return {
      statusLabel: "Email Failed",
      statusClass: "approval-delivery-failed",
      recipient: emailDelivery.recipient || "No email returned yet",
      helper: emailDelivery.error,
    };
  }

  if (Number(approvalCase.due_amount || 0) > 0) {
    return {
      statusLabel: "Awaiting Payment",
      statusClass: "",
      recipient: "Will use registered patient email after payment",
      helper: `Email will be sent only after full payment and finalization. Outstanding due: Rs ${Number(approvalCase.due_amount).toLocaleString("en-IN")}.`,
    };
  }

  if (approvalCase.review_status !== "finalized") {
    return {
      statusLabel: "Awaiting Finalization",
      statusClass: "",
      recipient: "Will use registered patient email at finalize",
      helper: "Results are not finalized yet. Email will be sent when the doctor confirms and finalizes the report.",
    };
  }

  return {
    statusLabel: "Pending Backend Delivery",
    statusClass: "",
    recipient: "Registered patient email",
    helper: "The report is finalized, but no backend email delivery result has been returned yet.",
  };
}

function buildApprovalAnalyteFromWorkflowItem(
  item: WorkflowBundle["items"][number],
  approvalCase: ApprovalCase,
): ApprovalCase["analytes"][number] {
  const status = buildStatusFromWorkflowItem(item);
  const metadata = getTestReferenceMetadata(item.test_name, item.service_category || "laboratory");

  return {
    order_test_id: item.order_test_id || `${item.visit_number}-${item.test_code}`,
    test_code: item.test_code,
    analyte_name: item.test_name,
    service_category: item.service_category || "laboratory",
    method_name: item.method_name || metadata.method_name || null,
    result_status: item.result_status || "pending",
    result_text: item.result_text || null,
    numeric_value: item.numeric_value !== null && item.numeric_value !== undefined ? String(item.numeric_value) : null,
    unit: item.unit || metadata.unit || null,
    reference_range_text: item.reference_range_text || metadata.reference_range_text || null,
    abnormal_flag: item.abnormal_flag || null,
    critical_flag: item.critical_flag || false,
    status_label: status.label,
    status_tone: status.tone,
  };
}

function mergeLocalEditsIntoApprovalCase(backendCase: ApprovalCase, localBundle: WorkflowBundle | null): ApprovalCase {
  if (!localBundle || localBundle.visit_number !== backendCase.visit_number) {
    return backendCase;
  }

  const localItemsByOrderId = new Map(
    localBundle.items.map((item) => [item.order_test_id || `${item.visit_number}-${item.test_code}`, item]),
  );
  const localItemsByTestCode = new Map(localBundle.items.map((item) => [item.test_code, item]));

  const mergedAnalytes = backendCase.analytes.map((analyte) => {
    const matchedLocalItem =
      localItemsByOrderId.get(analyte.order_test_id) ||
      localItemsByTestCode.get(analyte.test_code) ||
      localBundle.items.find((item) => item.test_name === analyte.analyte_name) ||
      null;

    if (!matchedLocalItem) {
      return analyte;
    }

    return buildApprovalAnalyteFromWorkflowItem(matchedLocalItem, backendCase);
  });

  return {
    ...backendCase,
    age_years: localBundle.patient.age_years ?? backendCase.age_years,
    sex: localBundle.patient.sex ?? backendCase.sex,
    patient_history: {
      ...backendCase.patient_history,
      diagnosis: localBundle.diagnosis || backendCase.patient_history.diagnosis,
      medication: localBundle.medication || backendCase.patient_history.medication,
      recent_notes: localBundle.clinical_notes || backendCase.patient_history.recent_notes,
    },
    analysis_title: `Current Analysis: ${(localBundle.items[0]?.sample_type || backendCase.analysis_title.replace(/^Current Analysis:\s*/i, "").replace(/\s+PANEL$/i, "") || "Pending").toUpperCase()} PANEL`,
    critical_alerts: mergedAnalytes.filter((item) => item.critical_flag).length,
    analytes: mergedAnalytes,
    doctor_note: localBundle.clinical_notes || backendCase.doctor_note || null,
  };
}

export default function ApprovalsPage() {
  const router = useRouter();
  const [approvalCase, setApprovalCase] = useState<ApprovalCase>(fallbackCase);
  const [doctorNote, setDoctorNote] = useState(fallbackCase.doctor_note || "");
  const [statusMessage, setStatusMessage] = useState("Loading approval case...");
  const [emailDelivery, setEmailDelivery] = useState<EmailDeliveryState>({
    sent: false,
    recipient: null,
    error: null,
    updatedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [interventions, setInterventions] = useState(fallbackCase.interventions);
  const [selectedAnalyteIndex, setSelectedAnalyteIndex] = useState(0);
  const [diagnosisInput, setDiagnosisInput] = useState(fallbackCase.patient_history.diagnosis || "");
  const [medicationInput, setMedicationInput] = useState(fallbackCase.patient_history.medication || "");

  const isAuthenticated = useAuthRedirect();
  const paymentBlocked = Number(approvalCase.due_amount || 0) > 0;

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void loadApprovalCase();
  }, [isAuthenticated]);

  useEffect(() => {
    const handleWorkflowUpdated = () => {
      void loadApprovalCase();
    };

    window.addEventListener(WORKFLOW_UPDATED_EVENT, handleWorkflowUpdated);
    return () => window.removeEventListener(WORKFLOW_UPDATED_EVENT, handleWorkflowUpdated);
  }, []);

  async function loadApprovalCase() {
    setLoading(true);
    const localBundle = loadWorkflowBundle();
    const visitNumber =
      typeof window === "undefined"
        ? localBundle?.visit_number || null
        : new URLSearchParams(window.location.search).get("visit") || localBundle?.visit_number || null;

    const matchingLocalBundle =
      localBundle &&
      (!visitNumber || localBundle.visit_number === visitNumber)
        ? localBundle
        : null;

    try {
      const query = visitNumber ? `?visit_number=${encodeURIComponent(visitNumber)}` : "";
      const response = await apiRequest<ApprovalCase>(`/api/results/approval-case${query}`);
      const effectiveCase = mergeLocalEditsIntoApprovalCase(response, matchingLocalBundle);
      setApprovalCase(effectiveCase);
      setDoctorNote(effectiveCase.doctor_note || "");
      setInterventions(effectiveCase.interventions);
      setDiagnosisInput(effectiveCase.patient_history.diagnosis === "Not documented" ? "" : effectiveCase.patient_history.diagnosis || "");
      setMedicationInput(effectiveCase.patient_history.medication === "Not documented" ? "" : effectiveCase.patient_history.medication || "");
      setStatusMessage(`Loaded approval review for ${effectiveCase.patient_name}.`);
    } catch {
      if (matchingLocalBundle) {
        const localCase = buildLocalApprovalCase(matchingLocalBundle);
        setApprovalCase(localCase);
        setDoctorNote(localCase.doctor_note || "");
        setInterventions(localCase.interventions);
        setDiagnosisInput(localCase.patient_history.diagnosis === "Not documented" ? "" : localCase.patient_history.diagnosis || "");
        setMedicationInput(localCase.patient_history.medication === "Not documented" ? "" : localCase.patient_history.medication || "");
        setStatusMessage(`Loaded local approval review for ${localCase.patient_name}.`);
      } else {
        setApprovalCase(fallbackCase);
        setDoctorNote(fallbackCase.doctor_note || "");
        setInterventions(fallbackCase.interventions);
        setDiagnosisInput("");
        setMedicationInput("");
        setStatusMessage("No backend or local approval case is available yet.");
      }
    } finally {
      setLoading(false);
    }
  }

  function savePatientHistoryField(field: "diagnosis" | "medication", value: string) {
    const normalizedValue = value.trim() || null;

    setApprovalCase((current) => ({
      ...current,
      patient_history: {
        ...current.patient_history,
        [field]: normalizedValue || "Not documented",
      },
    }));

    updateWorkflowBundle((current) =>
      current && current.visit_number === approvalCase.visit_number
        ? {
            ...current,
            [field]: normalizedValue,
          }
        : current,
    );
  }

  async function runAction(action: "retest" | "approve" | "finalize") {
    if (paymentBlocked && (action === "approve" || action === "finalize")) {
      setStatusMessage(`Payment pending. Doctor cannot approve results until the bill is fully paid. Due amount: Rs ${Number(approvalCase.due_amount).toLocaleString("en-IN")}.`);
      return;
    }
    setActing(action);
    try {
      const response = await apiRequest<ApprovalActionResponse>("/api/results/approve", {
        method: "POST",
        body: JSON.stringify({
          visit_number: approvalCase.visit_number,
          action,
          doctor_note: doctorNote,
          intervention_keys: interventions.filter((item) => item.checked).map((item) => item.key),
        }),
      });

      const localBundle = loadWorkflowBundle();
      if (localBundle && localBundle.visit_number === approvalCase.visit_number) {
        saveWorkflowBundle(syncBundleForApprovalAction(localBundle, action, doctorNote));
      }
      if (action === "finalize") {
        setEmailDelivery({
          sent: Boolean(response.report_emailed),
          recipient: response.report_emailed_to || null,
          error: response.report_email_error || null,
          updatedAt: response.approved_at || new Date().toISOString(),
        });
      }
      setStatusMessage(response.message || `${action} completed for ${response.visit_number}.`);
      await loadApprovalCase();
    } catch (error) {
      const localBundle = loadWorkflowBundle();
      const message = error instanceof Error ? error.message : "Action failed";
      const normalizedMessage = message.toLowerCase();
      const shouldFallbackToLocal =
        normalizedMessage.includes("failed to fetch") ||
        normalizedMessage.includes("network") ||
        normalizedMessage.includes("visit not found");
      if (!localBundle || !shouldFallbackToLocal) {
        if (action === "finalize") {
          setEmailDelivery({
            sent: false,
            recipient: null,
            error: message,
            updatedAt: new Date().toISOString(),
          });
        }
        setStatusMessage(message);
      } else {
        const updatedBundle: WorkflowBundle = syncBundleForApprovalAction(localBundle, action, doctorNote);
        saveWorkflowBundle(updatedBundle);
        const localCase = buildLocalApprovalCase(updatedBundle);
        setApprovalCase(localCase);
        setDoctorNote(doctorNote);
        setInterventions(localCase.interventions);
        if (action === "finalize") {
          setEmailDelivery({
            sent: false,
            recipient: null,
            error: normalizedMessage.includes("visit not found")
              ? "Backend could not find this visit, so approval was completed locally. Report email could not be sent from the backend."
              : "Backend email delivery is unavailable in local demo mode.",
            updatedAt: new Date().toISOString(),
          });
        }
        setStatusMessage(
          normalizedMessage.includes("visit not found")
            ? `${action} completed locally for ${updatedBundle.visit_number}. Backend did not recognize this visit.`
            : `${action} completed locally for ${updatedBundle.visit_number}.`,
        );
      }
    } finally {
      setActing(null);
    }
  }

  function handleExportReport() {
    try {
      exportApprovalReportPdf(approvalCase, doctorNote);
      setStatusMessage("Opening print-ready lab report. Choose Save as PDF in the print dialog.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to export report.");
    }
  }

  useEffect(() => {
    setSelectedAnalyteIndex(0);
  }, [approvalCase.visit_number, approvalCase.analytes.length]);

  const analyticsCard = useMemo(
    () => buildAnalyticsCardData(approvalCase, selectedAnalyteIndex),
    [approvalCase, selectedAnalyteIndex],
  );
  const deliveryPresentation = useMemo(
    () => getDeliveryPresentation(approvalCase, emailDelivery),
    [approvalCase, emailDelivery],
  );

  return (
    <AppShell overline="" title="" hidePageHeading searchPlaceholder="Search samples, patients, or results...">
      <section className="approval-page">
        <div className="approval-header-row">
          <div>
            <div className="approval-breadcrumbs">
              <span>Approvals</span>
              <span>&rsaquo;</span>
              <span>Review Queue</span>
            </div>
            <h1 className="approval-page-title">Doctor Approval</h1>
            <div className="approval-case-meta">Case: {approvalCase.patient_name} &bull; {approvalCase.case_label}</div>
          </div>
          <div className="approval-header-actions">
            <button
              className="approval-btn approval-btn-report"
              type="button"
              onClick={handleExportReport}
              disabled={acting !== null || approvalCase.analytes.length === 0}
            >
              <ExportIcon className="approval-btn-icon" />
              Export Report
            </button>
            <button className="approval-btn approval-btn-ghost" type="button" onClick={() => void runAction("retest")} disabled={acting !== null}>
              {acting === "retest" ? "Requesting..." : "Request Retest"}
            </button>
            <button className="approval-btn approval-btn-teal" type="button" onClick={() => void runAction("approve")} disabled={acting !== null || paymentBlocked}>
              {acting === "approve" ? "Approving..." : "Approve Result"}
            </button>
            <button className="approval-btn approval-btn-navy" type="button" onClick={() => void runAction("finalize")} disabled={acting !== null || paymentBlocked}>
              {acting === "finalize" ? "Finalizing..." : "Confirm & Finalize"}
            </button>
          </div>
        </div>

        <div className="approval-status-note">{loading ? "Refreshing..." : statusMessage}</div>
        {paymentBlocked ? (
          <div className="approval-payment-warning">
            Payment pending. Doctor cannot approve or finalize this case until the bill is fully paid. Outstanding due: Rs {Number(approvalCase.due_amount).toLocaleString("en-IN")}.
          </div>
        ) : null}

        <section className="panel approval-delivery-card">
          <div className="approval-card-kicker">Report Delivery</div>
          <div className="approval-delivery-grid">
            <div className="approval-delivery-item">
              <span>Status</span>
              <strong className={deliveryPresentation.statusClass}>
                {deliveryPresentation.statusLabel}
              </strong>
            </div>
            <div className="approval-delivery-item">
              <span>Recipient</span>
              <strong>{deliveryPresentation.recipient}</strong>
            </div>
            <div className="approval-delivery-item">
              <span>Updated</span>
              <strong>{emailDelivery.updatedAt ? formatReviewDate(emailDelivery.updatedAt) : "Not available"}</strong>
            </div>
          </div>
          {deliveryPresentation.helper ? <div className="approval-delivery-error">{deliveryPresentation.helper}</div> : null}
        </section>

        <section className="approval-top-grid">
          <article className="panel approval-history-card">
            <div className="approval-card-kicker">Patient History</div>
            <div className="approval-history-row"><span>Age / Sex</span><strong>{formatDemographics(approvalCase.age_years, approvalCase.sex)}</strong></div>
            <div className="approval-history-row approval-history-row-editable">
              <span>Diagnosis</span>
              <input
                className="approval-history-input"
                value={diagnosisInput}
                onChange={(event) => setDiagnosisInput(event.target.value)}
                onBlur={(event) => savePatientHistoryField("diagnosis", event.target.value)}
                placeholder="Not documented"
              />
            </div>
            <div className="approval-history-row approval-history-row-editable">
              <span>Medication</span>
              <input
                className="approval-history-input"
                value={medicationInput}
                onChange={(event) => setMedicationInput(event.target.value)}
                onBlur={(event) => savePatientHistoryField("medication", event.target.value)}
                placeholder="Not documented"
              />
            </div>
            <div className="approval-note-label">Recent Notes</div>
            <div className="approval-history-quote">"{approvalCase.patient_history.recent_notes}"</div>
          </article>

          <article className="approval-analysis-panel">
            <div className="approval-analysis-topbar">
              <div className="approval-analysis-title">{approvalCase.analysis_title}</div>
              <div className="approval-alert-badge">{approvalCase.critical_alerts} Critical Alerts</div>
            </div>
            <div className="approval-analysis-head">
              <span>Analyte</span>
              <span>Result</span>
              <span>Ref Range</span>
              <span>Status</span>
            </div>
            <div>
              {approvalCase.analytes.map((item) => {
                const displayMetadata = getAnalyteDisplayMetadata(item, approvalCase);
                const derivedFlag = getDerivedAnalyteFlag(item, approvalCase);
                const toneClass = item.status_tone === "critical" || derivedFlag ? "critical" : item.status_tone;
                return (
                  <div className={`approval-analysis-row ${toneClass}`} key={item.order_test_id}>
                    <div className="approval-analyte-name">
                      <strong>{item.analyte_name}</strong>
                      <span>{item.test_code}</span>
                    </div>
                    <div className={`approval-result-value ${toneClass}`}>{formatCaseValue(item, displayMetadata.unit)}</div>
                    <div className="approval-ref-range">{displayMetadata.referenceText}</div>
                    <div className={`approval-status-chip ${toneClass}`}>{item.status_label}</div>
                  </div>
                );
              })}
            </div>
          </article>
        </section>

        <section className="approval-mid-grid">
          <article className="panel approval-context-card">
            <div className="approval-card-kicker">Clinical Context</div>
            <div className="approval-context-item">
              <SparkIcon className="approval-context-icon" />
              <div>
                <strong>{approvalCase.clinical_context.fasting_status}</strong>
                <p>{approvalCase.clinical_context.fasting_note}</p>
              </div>
            </div>
            <div className="approval-context-item">
              <CalendarIcon className="approval-context-icon" />
              <div>
                <strong>Last Review</strong>
                <p>{formatReviewDate(approvalCase.clinical_context.last_review_at)} - {approvalCase.clinical_context.last_review_note}</p>
              </div>
            </div>
          </article>

          <article className="panel approval-trend-card">
            <div className="approval-trend-head">
              <div className="approval-card-kicker">{analyticsCard.title}</div>
              <div className="approval-trend-controls">
                <button
                  className="approval-trend-nav"
                  type="button"
                  onClick={() => setSelectedAnalyteIndex((current) => Math.max(0, current - 1))}
                  disabled={selectedAnalyteIndex === 0}
                  aria-label="Previous analyte"
                >
                  &lt;
                </button>
                <span className="approval-trend-count">{analyticsCard.countLabel}</span>
                <button
                  className="approval-trend-nav"
                  type="button"
                  onClick={() =>
                    setSelectedAnalyteIndex((current) => Math.min(approvalCase.analytes.length - 1, current + 1))
                  }
                  disabled={selectedAnalyteIndex >= approvalCase.analytes.length - 1}
                  aria-label="Next analyte"
                >
                  &gt;
                </button>
              </div>
            </div>
            <div className="approval-trend-tag">{analyticsCard.tag}</div>
            {analyticsCard.mode === "numeric" ? (
              <div className="approval-analytics-grid">
                <div className="approval-analytics-item">
                  <span>Current Finding</span>
                  <strong>{analyticsCard.displayValue}</strong>
                </div>
                <div className="approval-analytics-item">
                  <span>Status</span>
                  <strong>{analyticsCard.focus.status_label}</strong>
                </div>
                <div className="approval-analytics-item">
                  <span>Method</span>
                  <strong>{analyticsCard.metadata.methodName}</strong>
                </div>
                <div className="approval-analytics-item">
                  <span>Reference</span>
                  <strong>{analyticsCard.metadata.referenceText}</strong>
                </div>
                <div className="approval-analytics-item">
                  <span>Band Position</span>
                  <strong>{analyticsCard.bandLabel}</strong>
                </div>
                <div className="approval-analytics-item">
                  <span>Delta From Limit</span>
                  <strong>{analyticsCard.deviation}</strong>
                </div>
                <div className="approval-analytics-gauge">
                  <div className="approval-analytics-gauge-head">
                    <span>Reference band position</span>
                    <strong>{`${formatNumericReading(analyticsCard.bounds.low)} - ${formatNumericReading(analyticsCard.bounds.high)}${analyticsCard.metadata.unit ? ` ${analyticsCard.metadata.unit}` : ""}`}</strong>
                  </div>
                  <div className="approval-analytics-scale">
                    <span className="low" />
                    <span className="normal" />
                    <span className="high" />
                    <div className="approval-analytics-marker" style={{ left: `${analyticsCard.markerPercent}%` }} />
                  </div>
                  <div className="approval-analytics-scale-labels">
                    <span>Below Range</span>
                    <span>Reference Range</span>
                    <span>Above Range</span>
                  </div>
                </div>
                <div className="approval-analytics-note">
                  {analyticsCard.interpretation}
                </div>
              </div>
            ) : analyticsCard.mode === "summary" ? (
              <div className="approval-analytics-grid">
                <div className="approval-analytics-item">
                  <span>Current Finding</span>
                  <strong>{analyticsCard.displayValue}</strong>
                </div>
                <div className="approval-analytics-item">
                  <span>Status</span>
                  <strong>{analyticsCard.focus.status_label}</strong>
                </div>
                <div className="approval-analytics-item">
                  <span>Method</span>
                  <strong>{analyticsCard.metadata.methodName}</strong>
                </div>
                <div className="approval-analytics-item">
                  <span>Reference</span>
                  <strong>{analyticsCard.metadata.referenceText}</strong>
                </div>
                <div className="approval-analytics-item">
                  <span>Test Code</span>
                  <strong>{analyticsCard.focus.test_code}</strong>
                </div>
                <div className="approval-analytics-item">
                  <span>Result Type</span>
                  <strong>{analyticsCard.focus.numeric_value ? "Numeric Result" : "Narrative Result"}</strong>
                </div>
                <div className="approval-analytics-note">
                  {analyticsCard.interpretation}
                </div>
              </div>
            ) : (
              <div className="approval-analytics-note">Analytics will appear once results are entered for this case.</div>
            )}
          </article>

          <article className="panel approval-intervention-card">
            <div className="approval-card-kicker">Intervention Protocol</div>
            <div className="approval-checklist">
              {interventions.map((item) => (
                <label className="approval-check-row" key={item.key}>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() =>
                      setInterventions((current) =>
                        current.map((entry) => (entry.key === item.key ? { ...entry, checked: !entry.checked } : entry)),
                      )
                    }
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </article>
        </section>

        <section className="panel approval-footer-panel">
          <div className="approval-review-bar">
            <div className="approval-review-chip">
              <div className="approval-review-chip-label">Analysis Time</div>
              <div className="approval-review-chip-value">{approvalCase.analysis_time_label}</div>
              <TimerIcon className="approval-review-chip-icon" />
            </div>
            <div className="approval-progress-wrap">
              <span>Review Status:</span>
              <div className="approval-progress">
                <span className="filled" />
                <span className="filled" />
                <span className={approvalCase.validation_pending ? "" : "filled"} />
              </div>
              <strong>{approvalCase.review_status_label}</strong>
            </div>
          </div>

          <div className="approval-summary-shell">
            <textarea
              className="approval-summary-input"
              value={doctorNote}
              onChange={(event) => setDoctorNote(event.target.value)}
              placeholder="Enter clinical assessment and final findings..."
            />
            <div className="approval-signature-note">
              Electronic Signature Enabled: {approvalCase.doctor_name}, MD, PhD
            </div>
          </div>
        </section>
      </section>
    </AppShell>
  );
}
