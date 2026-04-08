"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SVGProps } from "react";

import { AppShell } from "../components/app-shell";
import { apiRequest } from "../lib/api";
import { getLocalCatalogTestByCodeOrName } from "../lib/local-test-catalog";
import { resolveDisplayReferenceRange } from "../lib/test-reference";
import { useAuthRedirect } from "../lib/use-auth-redirect";
import { loadWorkflowBundle, saveWorkflowBundle, updateWorkflowBundle, WORKFLOW_UPDATED_EVENT, type WorkflowBundle } from "../lib/workflow-storage";

type ResultWorklistItem = {
  order_test_id: string;
  visit_number: string;
  patient_id: string;
  patient_name: string;
  age_years?: number | null;
  sex?: string | null;
  clinical_notes?: string | null;
  barcode_value: string;
  test_code: string;
  test_name: string;
  service_category?: string | null;
  method_name?: string | null;
  sample_type: string;
  container_type: string;
  priority: string;
  specimen_status: string;
  result_status: string;
  result_text?: string | null;
  numeric_value?: string | number | null;
  unit?: string | null;
  reference_range_text?: string | null;
  display_reference_range?: string | null;
  tat_due_at?: string | null;
};

type EditableResultItem = ResultWorklistItem & {
  draftValue: string;
  abnormalFlag?: string | null;
  criticalFlag: boolean;
};

const testMethodMap: Record<string, string> = {
  sodium: "Potentiometry",
  glucose: "Hexokinase/UV",
  creatinine: "Enzymatic",
  urea: "Urease/GLDH",
  potassium: "Ion Selective Electrode",
  chloride: "ISE Method",
  hba1c: "HPLC",
  hemoglobin: "Cyanmethemoglobin",
};

function IconBase({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

function AttachIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M8 12.5 14.8 5.7a3 3 0 1 1 4.2 4.2l-8.2 8.2a5 5 0 0 1-7.1-7.1L12 2.8" />
    </IconBase>
  );
}

function SubmitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M5 12h14" />
      <path d="m13 5 7 7-7 7" />
    </IconBase>
  );
}

function ContextIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 6h12" />
      <path d="M4 11h10" />
      <path d="M4 16h8" />
      <path d="m18 8 2 2-5 5H13v-2z" />
    </IconBase>
  );
}

function PatientIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M4.5 18a5 5 0 0 1 9 0" />
      <path d="M16 8h4" />
      <path d="M16 12h4" />
      <path d="M16 16h4" />
    </IconBase>
  );
}

function MicroscopeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M7 21h10" />
      <path d="M10 11 7 8l2-2 3 3" />
      <path d="M13 14a4 4 0 1 0 4 4" />
      <path d="M12 6 9 3" />
      <path d="M15 13 9 19" />
    </IconBase>
  );
}

function ValidationIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="m5 12 4 4 10-10" />
      <path d="M5 5h4" />
      <path d="M5 19h4" />
    </IconBase>
  );
}

function toEditable(items: ResultWorklistItem[]) {
  return items.map((item) => ({
    ...item,
    draftValue: sanitizeDraftValue(item),
    abnormalFlag: null,
    criticalFlag: false,
  }));
}

function inferMethod(item: ResultWorklistItem) {
  if (item.method_name) {
    return item.method_name;
  }
  const key = item.test_name.toLowerCase();
  const matched = Object.keys(testMethodMap).find((entry) => key.includes(entry));
  return matched ? testMethodMap[matched] : "Analyzer Entry";
}

function normalizeQualitativeText(value: string) {
  return value.toLowerCase().replace(/[()]/g, " ").replace(/[/-]/g, " ").replace(/\s+/g, " ").trim();
}

function containsAnyTerm(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function evaluateQualitativeFlag(value: string, rangeText: string) {
  const normalizedValue = normalizeQualitativeText(value);
  const normalizedRange = normalizeQualitativeText(rangeText);

  const expectedNegative = containsAnyTerm(normalizedRange, [
    "negative",
    "non reactive",
    "nonreactive",
    "no growth",
    "no pathogen isolated",
    "not detected",
    "absent",
    "normal morphology",
  ]);

  if (!expectedNegative) {
    return { label: "Entered", tone: "normal" as const };
  }

  const matchesExpected = containsAnyTerm(normalizedValue, [
    "negative",
    "non reactive",
    "nonreactive",
    "no growth",
    "no pathogen isolated",
    "not detected",
    "absent",
    "normal",
  ]);

  if (matchesExpected) {
    return { label: "Normal", tone: "normal" as const };
  }

  const positiveLike = containsAnyTerm(normalizedValue, [
    "positive",
    "reactive",
    "detected",
    "present",
    "growth",
    "pathogen isolated",
    "seen",
  ]);

  if (positiveLike) {
    return { label: "Critical Positive", tone: "danger" as const };
  }

  return { label: "Critical Abnormal", tone: "danger" as const };
}

function evaluateFlag(value: string, rangeText?: string | null) {
  if (!value.trim() || !rangeText) {
    return { label: "Pending", tone: "pending" as const };
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return evaluateQualitativeFlag(value, rangeText);
  }

  const match = rangeText.match(/(-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return { label: "Entered", tone: "normal" as const };
  }

  const low = Number(match[1]);
  const high = Number(match[2]);
  if (numericValue < low) {
    return { label: `${numericValue} LOW`, tone: "danger" as const };
  }
  if (numericValue > high) {
    return { label: `${numericValue} HIGH`, tone: "danger" as const };
  }
  return { label: "Normal", tone: "normal" as const };
}

function formatStoredFlag(value: string, abnormalFlag?: string | null, criticalFlag?: boolean) {
  if (!abnormalFlag && !criticalFlag) {
    return { label: "Entered", tone: "normal" as const };
  }

  if (abnormalFlag === "LOW") {
    return { label: `${value} LOW`, tone: "danger" as const };
  }
  if (abnormalFlag === "HIGH") {
    return { label: `${value} HIGH`, tone: "danger" as const };
  }
  if (abnormalFlag === "POSITIVE") {
    return { label: "Critical Positive", tone: "danger" as const };
  }
  if (abnormalFlag === "ABNORMAL") {
    return { label: "Critical Abnormal", tone: "danger" as const };
  }
  if (criticalFlag) {
    return { label: "Critical", tone: "danger" as const };
  }
  return { label: "Entered", tone: "normal" as const };
}

function isNarrativeEntry(item: ResultWorklistItem) {
  const method = (item.method_name || "").toLowerCase();
  const category = (item.service_category || "").toLowerCase();
  return category === "radiology" || category === "cardiology" || method.includes("narrative") || method.includes("radiologist") || method.includes("specialist");
}

function sanitizeDraftValue(item: ResultWorklistItem) {
  const rawValue =
    item.numeric_value !== null && item.numeric_value !== undefined
      ? String(item.numeric_value)
      : item.result_text || "";

  if (!isNarrativeEntry(item)) {
    return rawValue;
  }

  const normalized = normalizeQualitativeText(rawValue);
  if (["done", "completed", "complete", "ok", "normal study"].includes(normalized)) {
    return "";
  }

  return rawValue;
}

function getEntryPlaceholder(item: ResultWorklistItem) {
  const testName = item.test_name.toLowerCase();
  if (isNarrativeEntry(item)) {
    if (testName.includes("x-ray") || testName.includes("x ray")) {
      return "Enter X-ray impression, e.g. No fracture or dislocation seen";
    }
    return "Enter narrative findings / impression";
  }
  if ((item.reference_range_text || "").toLowerCase().includes("negative")) {
    return "Enter result, e.g. Positive or Negative";
  }
  return "Entry...";
}

function getDisplayReferenceText(item: Pick<ResultWorklistItem, "display_reference_range" | "reference_range_text" | "sex" | "age_years" | "service_category" | "method_name">) {
  const resolvedRange = item.display_reference_range || resolveDisplayReferenceRange(item.reference_range_text, item.sex, item.age_years);

  if (resolvedRange) {
    return resolvedRange;
  }

  const category = (item.service_category || "").toLowerCase();
  const method = (item.method_name || "").toLowerCase();
  if (category === "radiology" || category === "cardiology" || method.includes("narrative") || method.includes("specialist")) {
    return "Narrative impression";
  }

  return null;
}

function isBackendUnavailableError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("load failed") ||
    normalized.includes("fetch") ||
    normalized.includes("timeout")
  );
}

function workflowItemKey(item: { order_test_id?: string | null; visit_number: string; barcode_value: string; test_code: string }) {
  return item.order_test_id || `${item.visit_number}-${item.barcode_value}-${item.test_code}`;
}

function formatDemographics(ageYears?: number | null, sex?: string | null) {
  const ageLabel = ageYears !== null && ageYears !== undefined ? `${ageYears} Y` : "Age not captured";
  const normalizedSex = sex?.trim();
  const sexLabel = normalizedSex ? normalizedSex.toUpperCase() : "Sex not captured";
  return `${ageLabel} / ${sexLabel}`;
}

function buildFallbackResults(bundle: WorkflowBundle): EditableResultItem[] {
  return bundle.items.map((item, index) => {
    const catalogItem = getLocalCatalogTestByCodeOrName(item.test_code, item.test_name);
    return {
      order_test_id: item.order_test_id || `${bundle.visit_number}-${index + 1}`,
      visit_number: bundle.visit_number,
      patient_id: item.patient_id,
      patient_name: bundle.patient.patient_name,
      age_years: bundle.patient.age_years ?? null,
      sex: bundle.patient.sex ?? null,
      clinical_notes: bundle.clinical_notes || "Patient routed from specimen collection. Enter analytical findings and review before final submission.",
      barcode_value: item.barcode_value,
      test_code: item.test_code,
      test_name: item.test_name,
      service_category: item.service_category || catalogItem?.service_category || "laboratory",
      method_name: item.method_name || catalogItem?.method_name || null,
      sample_type: item.sample_type,
      container_type: item.container_type,
      priority: item.priority || "normal",
      specimen_status: item.specimen_status,
      result_status: item.result_status || "pending",
      result_text: item.result_text ?? null,
      numeric_value: item.numeric_value ?? null,
      unit: item.unit ?? catalogItem?.unit ?? null,
      reference_range_text: item.reference_range_text ?? catalogItem?.reference_range_text ?? null,
      display_reference_range: resolveDisplayReferenceRange(
        item.reference_range_text ?? catalogItem?.reference_range_text,
        bundle.patient.sex,
        bundle.patient.age_years,
      ),
      tat_due_at: null,
      draftValue: sanitizeDraftValue({
        order_test_id: item.order_test_id || `${bundle.visit_number}-${index + 1}`,
        visit_number: bundle.visit_number,
        patient_id: item.patient_id,
        patient_name: bundle.patient.patient_name,
        age_years: bundle.patient.age_years ?? null,
        sex: bundle.patient.sex ?? null,
        clinical_notes: bundle.clinical_notes || null,
        barcode_value: item.barcode_value,
        test_code: item.test_code,
        test_name: item.test_name,
        service_category: item.service_category || catalogItem?.service_category || "laboratory",
        method_name: item.method_name || catalogItem?.method_name || null,
        sample_type: item.sample_type,
        container_type: item.container_type,
        priority: item.priority || "normal",
        specimen_status: item.specimen_status,
        result_status: item.result_status || "pending",
        result_text: item.result_text ?? null,
        numeric_value: item.numeric_value ?? null,
        unit: item.unit ?? catalogItem?.unit ?? null,
        reference_range_text: item.reference_range_text ?? catalogItem?.reference_range_text ?? null,
        display_reference_range: resolveDisplayReferenceRange(
          item.reference_range_text ?? catalogItem?.reference_range_text,
          bundle.patient.sex,
          bundle.patient.age_years,
        ),
        tat_due_at: null,
      }),
      abnormalFlag: item.abnormal_flag ?? null,
      criticalFlag: item.critical_flag ?? false,
    };
  });
}

function buildWorkflowBundleFromResults(items: ResultWorklistItem[], clinicalNotes: string): WorkflowBundle | null {
  if (items.length === 0) {
    return null;
  }

  const firstItem = items[0];
  return {
    visit_number: firstItem.visit_number,
      patient: {
        patient_id: firstItem.patient_id,
        patient_name: firstItem.patient_name,
        sex: firstItem.sex ?? null,
        age_years: firstItem.age_years ?? null,
    },
    clinical_notes: clinicalNotes || firstItem.clinical_notes || null,
    items: items.map((item) => ({
      order_test_id: item.order_test_id,
      specimen_id: item.order_test_id,
      specimen_number: item.order_test_id,
      visit_number: item.visit_number,
      patient_id: item.patient_id,
      patient_name: item.patient_name,
      sex: item.sex ?? null,
      age_years: item.age_years ?? null,
      mobile_number: null,
      test_code: item.test_code,
      test_name: item.test_name,
      sample_type: item.sample_type,
      container_type: item.container_type,
      barcode_value: item.barcode_value,
      specimen_status: item.specimen_status,
      tat_due_at: item.tat_due_at ?? null,
      service_category: item.service_category ?? null,
      method_name: item.method_name ?? null,
      unit: item.unit ?? null,
      reference_range_text: item.reference_range_text ?? null,
      priority: item.priority ?? "normal",
      result_status: item.result_status ?? "pending",
      result_text: item.result_text ?? null,
      numeric_value: item.numeric_value ?? null,
      abnormal_flag: null,
      critical_flag: false,
    })),
  };
}

function mergeBackendRowsIntoBundle(
  bundle: WorkflowBundle,
  items: ResultWorklistItem[],
  clinicalNotes: string,
): WorkflowBundle {
  const rowMap = new Map(
    items.map((item) => [
      workflowItemKey(item),
      item,
    ]),
  );

  return {
    ...bundle,
    clinical_notes: clinicalNotes || bundle.clinical_notes || null,
    items: bundle.items.map((item) => {
      const matched =
        rowMap.get(workflowItemKey(item)) ||
        items.find((row) => row.test_code === item.test_code && row.barcode_value === item.barcode_value) ||
        null;

      if (!matched) {
        return item;
      }

      return {
        ...item,
        order_test_id: matched.order_test_id,
        patient_id: matched.patient_id,
        patient_name: matched.patient_name,
        sex: matched.sex ?? item.sex ?? bundle.patient.sex ?? null,
        age_years: matched.age_years ?? item.age_years ?? bundle.patient.age_years ?? null,
        specimen_status: matched.specimen_status,
        tat_due_at: matched.tat_due_at ?? item.tat_due_at ?? null,
        service_category: matched.service_category ?? item.service_category ?? null,
        method_name: matched.method_name ?? item.method_name ?? null,
        unit: matched.unit ?? item.unit ?? null,
        reference_range_text: matched.reference_range_text ?? item.reference_range_text ?? null,
        priority: matched.priority ?? item.priority ?? "normal",
        result_status: matched.result_status ?? item.result_status ?? "pending",
        result_text: matched.result_text ?? item.result_text ?? null,
        numeric_value: matched.numeric_value ?? item.numeric_value ?? null,
      };
    }),
  };
}

export default function ResultsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [visitFilter, setVisitFilter] = useState("");
  const [barcodeFilter, setBarcodeFilter] = useState("");
  const [resultItems, setResultItems] = useState<EditableResultItem[]>([]);
  const [statusMessage, setStatusMessage] = useState("Load a visit or accession to start analytical result entry.");
  const [loading, setLoading] = useState(false);
  const [savingRow, setSavingRow] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [clinicalNote, setClinicalNote] = useState("");
  const [labSlipName, setLabSlipName] = useState("No attachment selected");
  const [autosaveTime, setAutosaveTime] = useState("--:--:--");
  const [showPreview, setShowPreview] = useState(false);

  const isAuthenticated = useAuthRedirect();

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const visit = params.get("visit") || "";
    const barcode = params.get("barcode") || "";
    const savedBundle = loadWorkflowBundle();

    setVisitFilter(visit);
    setBarcodeFilter(barcode);

    if (savedBundle) {
      try {
        const fallbackItems = buildFallbackResults(savedBundle);
        setResultItems(fallbackItems);
        setVisitFilter(visit || savedBundle.visit_number);
        setClinicalNote(fallbackItems[0]?.clinical_notes || "");
        setStatusMessage(`Prepared ${fallbackItems.length} analytical rows for visit ${visit || savedBundle.visit_number}.`);
      } catch {
        setResultItems([]);
      }
    }

    if (visit || barcode) {
      void loadWorklist(visit, barcode);
    }
  }, [isAuthenticated, router]);

  const patientCard = resultItems[0];
  const panelTitle = useMemo(() => {
    if (!patientCard) {
      return "Chemistry Panel - Serum";
    }
    const category = patientCard.service_category === "radiology" ? "Imaging Review" : patientCard.service_category === "cardiology" ? "Cardiology Panel" : "Chemistry Panel";
    return `${category} - ${patientCard.sample_type}`;
  }, [patientCard]);

  const previewSummary = useMemo(() => {
    const entered = resultItems.filter((item) => item.draftValue.trim()).length;
    const pending = resultItems.length - entered;
    const abnormal = resultItems.filter((item) => evaluateFlag(item.draftValue, item.reference_range_text).tone === "danger").length;
    return { entered, pending, abnormal };
  }, [resultItems]);

  const enteredResultRows = useMemo(() => {
    return resultItems
      .filter((item) => item.draftValue.trim())
      .map((item) => {
        const activeRange = getDisplayReferenceText(item);
        const flag = item.abnormalFlag || item.criticalFlag
          ? formatStoredFlag(item.draftValue, item.abnormalFlag, item.criticalFlag)
          : activeRange
            ? evaluateFlag(item.draftValue, activeRange)
            : { label: "Entered", tone: "normal" as const };

        return {
          order_test_id: item.order_test_id,
          test_name: item.test_name,
          method_name: inferMethod(item),
          entered_value: item.draftValue,
          unit: item.unit || "--",
          reference_range: activeRange || "--",
          status_label: flag.label,
          status_tone: flag.tone,
        };
      });
  }, [resultItems]);

  async function loadWorklist(visitArg = visitFilter, barcodeArg = barcodeFilter) {
    if (!visitArg.trim() && !barcodeArg.trim()) {
      setStatusMessage("Enter a visit number or barcode to load the result worklist.");
      return;
    }

    setLoading(true);
    try {
      const savedBundle = loadWorkflowBundle();
      const query = new URLSearchParams();
      if (visitArg.trim()) {
        query.set("visit_number", visitArg.trim());
      }
      if (barcodeArg.trim()) {
        query.set("barcode_value", barcodeArg.trim());
      }
      const response = await apiRequest<ResultWorklistItem[]>(`/api/results/worklist?${query.toString()}`);
      const matchingLocalBundle =
        savedBundle &&
        (!visitArg.trim() || savedBundle.visit_number === visitArg.trim())
          ? savedBundle
          : null;

      const effectiveBundle = matchingLocalBundle
        ? mergeBackendRowsIntoBundle(matchingLocalBundle, response, response[0]?.clinical_notes || "")
        : buildWorkflowBundleFromResults(response, response[0]?.clinical_notes || "");

      const editable = effectiveBundle ? buildFallbackResults(effectiveBundle) : toEditable(response);
      setResultItems(editable);
      setClinicalNote(effectiveBundle?.clinical_notes || response[0]?.clinical_notes || "No clinical note available yet.");
      if (effectiveBundle) {
        saveWorkflowBundle(effectiveBundle);
      }
      setStatusMessage(editable.length > 0 ? `Loaded ${editable.length} result lines for the active billed visit.` : "No result entries found for this accession.");
    } catch {
      const savedBundle = loadWorkflowBundle();
      if (savedBundle) {
        const fallback = buildFallbackResults(savedBundle).filter((item) => {
          const visitMatch = !visitArg.trim() || item.visit_number.toLowerCase().includes(visitArg.trim().toLowerCase());
          const barcodeMatch = !barcodeArg.trim() || item.barcode_value.toLowerCase().includes(barcodeArg.trim().toLowerCase());
          return visitMatch && barcodeMatch;
        });
        setResultItems(fallback);
        setClinicalNote(fallback[0]?.clinical_notes || "");
        setStatusMessage(fallback.length > 0 ? `Loaded ${fallback.length} local analytical rows in demo mode.` : "No local analytical rows matched this accession.");
      } else {
        setResultItems([]);
        setStatusMessage("Backend results API is unavailable and there is no local handoff data yet.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (resultItems.length === 0) {
      return;
    }

    updateWorkflowBundle((current) =>
      current
        ? {
            ...current,
            clinical_notes: clinicalNote,
          }
        : current,
    );
  }, [clinicalNote, resultItems.length]);

  useEffect(() => {
    const handleWorkflowUpdated = () => {
      const savedBundle = loadWorkflowBundle();
      if (!savedBundle) {
        return;
      }
      setVisitFilter((current) => current || savedBundle.visit_number);
      setResultItems(buildFallbackResults(savedBundle));
      setClinicalNote(savedBundle.clinical_notes || "");
      setStatusMessage(`Workflow refreshed from assistant actions for ${savedBundle.visit_number}.`);
    };

    window.addEventListener(WORKFLOW_UPDATED_EVENT, handleWorkflowUpdated);
    return () => window.removeEventListener(WORKFLOW_UPDATED_EVENT, handleWorkflowUpdated);
  }, []);

  function updateDraft(orderTestId: string, value: string) {
    setResultItems((current) => current.map((item) => (item.order_test_id === orderTestId ? { ...item, draftValue: value } : item)));
    setAutosaveTime(new Date().toLocaleTimeString("en-IN", { hour12: false }));
  }

  async function saveResult(item: EditableResultItem) {
    if (!item.draftValue.trim()) {
      return;
    }

    const numericValue = Number(item.draftValue);
    const hasNumericValue = !Number.isNaN(numericValue) && item.draftValue.trim() !== "";

    setSavingRow(item.order_test_id);
    try {
      const response = await apiRequest<{
        result_status: string;
        numeric_value?: string | number | null;
        result_text?: string | null;
        abnormal_flag?: string | null;
        critical_flag: boolean;
      }>("/api/results/entry", {
        method: "PATCH",
        body: JSON.stringify({
          order_test_id: item.order_test_id,
          numeric_value: hasNumericValue ? numericValue : null,
          result_text: hasNumericValue ? null : item.draftValue,
          result_status: "entered",
        }),
      });

      setResultItems((current) =>
        current.map((row) =>
          row.order_test_id === item.order_test_id
            ? {
                ...row,
                result_status: response.result_status,
                numeric_value: response.numeric_value ?? null,
                result_text: response.result_text ?? null,
                abnormalFlag: response.abnormal_flag ?? null,
                criticalFlag: response.critical_flag,
              }
            : row,
        ),
      );
      updateWorkflowBundle((current) =>
        current
          ? {
              ...current,
              clinical_notes: clinicalNote,
              items: current.items.map((row) =>
                workflowItemKey(row) === item.order_test_id
                  ? {
                      ...row,
                      order_test_id: item.order_test_id,
                      result_status: response.result_status,
                      numeric_value: response.numeric_value ?? null,
                      result_text: response.result_text ?? null,
                      abnormal_flag: response.abnormal_flag ?? null,
                      critical_flag: response.critical_flag,
                    }
                  : row,
              ),
            }
          : current,
      );
      setStatusMessage(`Saved ${item.test_name} to backend.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save result.";
      if (!isBackendUnavailableError(message)) {
        setStatusMessage(message);
        return;
      }

      const previewFlag = evaluateFlag(item.draftValue, item.reference_range_text);
      const nextRows = resultItems.map((row) =>
          row.order_test_id === item.order_test_id
            ? {
                ...row,
                result_status: "entered",
                numeric_value: hasNumericValue ? numericValue : null,
                result_text: hasNumericValue ? null : item.draftValue,
                abnormalFlag:
                  previewFlag.tone === "danger"
                    ? previewFlag.label === "Critical Positive"
                      ? "POSITIVE"
                      : "ABNORMAL"
                    : null,
                criticalFlag: previewFlag.tone === "danger",
              }
            : row,
        );
      setResultItems(nextRows);
      updateWorkflowBundle((current) =>
        current
          ? {
              ...current,
              clinical_notes: clinicalNote,
              items: current.items.map((row) => {
                const matched = nextRows.find((entry) => entry.order_test_id === workflowItemKey(row));
                return matched
                  ? {
                      ...row,
                      order_test_id: matched.order_test_id,
                      result_status: matched.result_status,
                      numeric_value: matched.numeric_value,
                      result_text: matched.result_text,
                      abnormal_flag: matched.abnormalFlag ?? null,
                      critical_flag: matched.criticalFlag,
                    }
                  : row;
              }),
            }
          : current,
      );
      setStatusMessage(`Saved ${item.test_name} locally in demo mode.`);
    } finally {
      setSavingRow(null);
      setAutosaveTime(new Date().toLocaleTimeString("en-IN", { hour12: false }));
    }
  }

  async function persistDraftedResultsToBackend() {
    const draftedItems = resultItems.filter((item) => item.draftValue.trim());

    for (const item of draftedItems) {
      const numericValue = Number(item.draftValue);
      const hasNumericValue = !Number.isNaN(numericValue) && item.draftValue.trim() !== "";

      const response = await apiRequest<{
        result_status: string;
        numeric_value?: string | number | null;
        result_text?: string | null;
        abnormal_flag?: string | null;
        critical_flag: boolean;
      }>("/api/results/entry", {
        method: "PATCH",
        body: JSON.stringify({
          order_test_id: item.order_test_id,
          numeric_value: hasNumericValue ? numericValue : null,
          result_text: hasNumericValue ? null : item.draftValue,
          result_status: "entered",
        }),
      });

      setResultItems((current) =>
        current.map((row) =>
          row.order_test_id === item.order_test_id
            ? {
                ...row,
                result_status: response.result_status,
                numeric_value: response.numeric_value ?? null,
                result_text: response.result_text ?? null,
                abnormalFlag: response.abnormal_flag ?? null,
                criticalFlag: response.critical_flag,
              }
            : row,
        ),
      );
      updateWorkflowBundle((current) =>
        current
          ? {
              ...current,
              clinical_notes: clinicalNote,
              items: current.items.map((row) =>
                workflowItemKey(row) === item.order_test_id
                  ? {
                      ...row,
                      order_test_id: item.order_test_id,
                      result_status: response.result_status,
                      numeric_value: response.numeric_value ?? null,
                      result_text: response.result_text ?? null,
                      abnormal_flag: response.abnormal_flag ?? null,
                      critical_flag: response.critical_flag,
                    }
                  : row,
              ),
            }
          : current,
      );
    }
  }

  async function submitResults() {
    const activeVisit = patientCard?.visit_number || visitFilter;
    if (!activeVisit) {
      setStatusMessage("Load a visit before submitting results.");
      return;
    }

    setSubmitting(true);
    try {
      await persistDraftedResultsToBackend();
      const approval = await apiRequest<{ visit_number: string; approved_tests: number }>("/api/results/approve", {
        method: "POST",
        body: JSON.stringify({ visit_number: activeVisit }),
      });
      setStatusMessage(`Submitted and approved ${approval.approved_tests} results for ${approval.visit_number}.`);
      router.push(`/approvals?visit=${encodeURIComponent(activeVisit)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit results.";
      if (!isBackendUnavailableError(message)) {
        setStatusMessage(message);
        return;
      }

      updateWorkflowBundle((current) =>
        current
          ? {
              ...current,
              clinical_notes: clinicalNote,
              items: current.items.map((row) => {
                const matched = resultItems.find((entry) => entry.order_test_id === workflowItemKey(row));
                if (!matched || !matched.draftValue.trim()) {
                  return row;
                }
                return {
                  ...row,
                  order_test_id: matched.order_test_id,
                  result_status: "approved",
                  numeric_value: matched.numeric_value,
                  result_text: matched.result_text,
                  abnormal_flag: matched.abnormalFlag ?? null,
                  critical_flag: matched.criticalFlag,
                };
              }),
            }
          : current,
      );
      setStatusMessage(`Result submission saved locally. Backend approval is not available right now for ${activeVisit}.`);
      router.push(`/approvals?visit=${encodeURIComponent(activeVisit)}`);
    } finally {
      setSubmitting(false);
    }
  }

  function clearAllDrafts() {
    setResultItems((current) => current.map((item) => ({ ...item, draftValue: "", result_text: null, numeric_value: null, result_status: "pending", abnormalFlag: null, criticalFlag: false })));
    updateWorkflowBundle((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) => ({
              ...item,
              result_status: "pending",
              result_text: null,
              numeric_value: null,
              abnormal_flag: null,
              critical_flag: false,
            })),
          }
        : current,
    );
    setStatusMessage("Cleared unsaved entry fields.");
  }

  function handleAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setLabSlipName(file.name);
    setStatusMessage(`Attached lab slip: ${file.name}`);
  }

  return (
    <AppShell
      overline="Diagnostic Workflow"
      title="Result Entry"
      searchPlaceholder="Search Patient ID or Accession..."
      action={
        <div className="results-header-actions">
          <input ref={fileInputRef} className="results-hidden-input" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleAttachment} />
          <button className="results-attach-button" type="button" onClick={() => fileInputRef.current?.click()}>
            <AttachIcon className="results-action-icon" />
            <span>Attach Lab Slip</span>
          </button>
          <button className="results-submit-button" type="button" onClick={() => void submitResults()} disabled={submitting}>
            <SubmitIcon className="results-action-icon" />
            <span>{submitting ? "Submitting..." : "Submit Results"}</span>
          </button>
        </div>
      }
    >
      <section className="results-load-strip panel">
        <div className="results-load-fields">
          <div className="field">
            <label className="label">Visit Number</label>
            <input className="input" value={visitFilter} onChange={(event) => setVisitFilter(event.target.value)} placeholder="VIS-..." />
          </div>
          <div className="field">
            <label className="label">Barcode / Accession</label>
            <input className="input" value={barcodeFilter} onChange={(event) => setBarcodeFilter(event.target.value)} placeholder="BC-..." />
          </div>
          <button className="secondary-btn results-load-button" type="button" onClick={() => void loadWorklist()} disabled={loading}>
            {loading ? "Loading..." : "Load Results"}
          </button>
        </div>
        <div className="results-status-inline">{statusMessage}</div>
      </section>

      <section className="results-context-grid">
        <article className="panel results-patient-card">
          <div className="results-patient-icon-wrap"><PatientIcon className="results-patient-icon" /></div>
          <div className="results-patient-copy">
            <h3>{patientCard?.patient_name || "Awaiting accession"}</h3>
            <div className="results-patient-id">ID: {patientCard?.patient_id || "Not loaded"}</div>
            <div className="results-patient-badges">
              <span className="results-mini-badge neutral">{patientCard ? formatDemographics(patientCard.age_years, patientCard.sex) : "No demographic data"}</span>
              <span className="results-mini-badge alert">{patientCard ? `${(patientCard.priority || "normal").toUpperCase()} PRIORITY` : labSlipName}</span>
            </div>
          </div>
        </article>

        <article className="panel results-context-card">
          <div className="results-section-heading"><ContextIcon className="results-section-icon" /><span>Historical Clinical Context</span></div>
          <div className="results-context-quote">"{clinicalNote || "Clinical context will appear here once the accession is loaded from the backend."}"</div>
          <div className="results-context-meta">Attachment: {labSlipName}</div>
        </article>
      </section>

      <section className="results-panel-shell">
        <div className="results-panel-header">
          <div className="results-panel-title"><MicroscopeIcon className="results-panel-icon" /><span>{panelTitle}</span></div>
          <div className="results-specimen-chip">Specimen ID: {patientCard?.barcode_value || "Awaiting sample"}</div>
        </div>

        <div className="results-table-head">
          <span>Test Parameter</span>
          <span>Measured Value</span>
          <span>Unit</span>
          <span>Ref. Range</span>
          <span>Flags</span>
        </div>

        <div className="results-table-body">
          {resultItems.length > 0 ? (
            resultItems.map((item) => {
              const activeRange = getDisplayReferenceText(item);
              const flag = item.abnormalFlag || item.criticalFlag
                ? formatStoredFlag(item.draftValue, item.abnormalFlag, item.criticalFlag)
                : item.draftValue.trim()
                  ? activeRange
                    ? evaluateFlag(item.draftValue, activeRange)
                    : { label: "Entered", tone: "normal" as const }
                  : { label: "Pending", tone: "pending" as const };
              const entryDisabled = !["received", "collected"].includes(item.specimen_status.toLowerCase());

              return (
                <div className="results-row" key={item.order_test_id}>
                  <div className="results-parameter-cell">
                    <strong>{item.test_name}</strong>
                    <span>{inferMethod(item)}</span>
                  </div>

                  <div className="results-value-cell">
                    <input
                      className={`results-entry-input ${flag.tone === "danger" ? "alert" : ""}`}
                      value={item.draftValue}
                      onChange={(event) => updateDraft(item.order_test_id, event.target.value)}
                      onBlur={() => void saveResult(item)}
                      placeholder={getEntryPlaceholder(item)}
                      disabled={entryDisabled}
                    />
                    {savingRow === item.order_test_id ? <small className="results-save-state">Saving...</small> : null}
                  </div>

                  <div className="results-unit-cell">{item.unit || "--"}</div>
                  <div className="results-range-cell">{activeRange || "--"}</div>
                  <div className={`results-flag-cell ${entryDisabled ? "pending" : flag.tone}`}>{entryDisabled ? "Awaiting specimen" : flag.label}</div>
                </div>
              );
            })
          ) : (
            <div className="empty-state results-empty-state">No analytical lines loaded yet. Search by visit number or carry a collected case forward from the queue.</div>
          )}
        </div>
      </section>

      <section className="panel results-note-card">
        <div className="collection-section-kicker">Pathologist Observations / Internal Notes</div>
        <textarea className="results-notes-area" value={clinicalNote} onChange={(event) => setClinicalNote(event.target.value)} placeholder="Enter clinical observations or flag discrepancies for supervisor review..." />
      </section>

      {enteredResultRows.length > 0 ? (
        <section className="panel results-entered-card">
          <details className="results-entered-details" open>
            <summary className="results-entered-summary">
              <div>
                <div className="results-entered-kicker">Entered Case Summary</div>
                <strong>{patientCard?.patient_name || "Current Patient"} • {patientCard?.visit_number || visitFilter || "Visit Pending"}</strong>
              </div>
              <span className="results-entered-count">{enteredResultRows.length} Values Entered</span>
            </summary>

            <div className="results-entered-table">
              {enteredResultRows.map((row) => (
                <div className="results-entered-row" key={row.order_test_id}>
                  <div className="results-entered-name">
                    <strong>{row.test_name}</strong>
                    <span>{row.method_name}</span>
                  </div>
                  <div className="results-entered-value">{row.entered_value} {row.unit !== "--" ? row.unit : ""}</div>
                  <div className="results-entered-range">{row.reference_range}</div>
                  <div className={`results-entered-flag ${row.status_tone}`}>{row.status_label}</div>
                </div>
              ))}
            </div>
          </details>
        </section>
      ) : null}

      <section className="results-bottom-bar">
        <div className="results-bottom-meta">
          <span className="results-live-dot" />
          <span>Autosave Active: {autosaveTime}</span>
          <div className="results-avatar-stack"><span /><span /></div>
        </div>
        <div className="results-bottom-actions">
          <button className="results-clear-button" type="button" onClick={clearAllDrafts}>Clear All Fields</button>
          <button className="results-validate-button" type="button" onClick={() => setShowPreview((current) => !current)}>
            <ValidationIcon className="results-action-icon" />
            <span>Validation Preview</span>
          </button>
        </div>
      </section>

      {showPreview ? (
        <section className="panel results-preview-card">
          <div className="results-preview-grid">
            <div><span>Entered</span><strong>{previewSummary.entered}</strong></div>
            <div><span>Pending</span><strong>{previewSummary.pending}</strong></div>
            <div><span>Abnormal</span><strong>{previewSummary.abnormal}</strong></div>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

