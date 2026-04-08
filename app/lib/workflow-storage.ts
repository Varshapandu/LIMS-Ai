export type WorkflowPatient = {
  patient_id: string;
  patient_name: string;
  sex?: string | null;
  age_years?: number | null;
  mobile_number?: string | null;
  email?: string | null;
};

export type WorkflowItem = {
  order_test_id?: string | null;
  specimen_id: string;
  specimen_number: string;
  visit_number: string;
  patient_id: string;
  patient_name: string;
  sex?: string | null;
  age_years?: number | null;
  mobile_number?: string | null;
  email?: string | null;
  test_code: string;
  test_name: string;
  sample_type: string;
  container_type: string;
  barcode_value: string;
  specimen_status: string;
  rejection_reason?: string | null;
  tat_due_at?: string | null;
  service_category?: string | null;
  method_name?: string | null;
  unit?: string | null;
  reference_range_text?: string | null;
  priority?: string | null;
  result_status?: string | null;
  result_text?: string | null;
  numeric_value?: string | number | null;
  abnormal_flag?: string | null;
  critical_flag?: boolean;
};

export type WorkflowBundle = {
  visit_number: string;
  patient: WorkflowPatient;
  clinical_notes?: string | null;
  diagnosis?: string | null;
  medication?: string | null;
  items: WorkflowItem[];
  created_at?: string;
  updated_at?: string;
};

const STORAGE_KEY = "ai-lims-last-collection";
export const WORKFLOW_UPDATED_EVENT = "workflow-updated";

type LegacyCollectionBundle = {
  visit_number: string;
  patient_name: string;
  items: Array<Partial<WorkflowItem> & {
    patient_id?: string;
    patient_name?: string;
    barcode_value: string;
    test_code: string;
    test_name: string;
    sample_type: string;
    container_type: string;
    specimen_status: string;
  }>;
};

function normalizeWorkflowItem(item: Partial<WorkflowItem>, visitNumber: string, patient: WorkflowPatient, index: number): WorkflowItem {
  return {
    order_test_id: item.order_test_id || `${visitNumber}-${item.test_code || "TEST"}-${index + 1}`,
    specimen_id: item.specimen_id || `SPM-${visitNumber}-${index + 1}`,
    specimen_number: item.specimen_number || `SPM-${visitNumber}-${index + 1}`,
    visit_number: item.visit_number || visitNumber,
    patient_id: item.patient_id || patient.patient_id,
    patient_name: item.patient_name || patient.patient_name,
    sex: item.sex ?? patient.sex ?? null,
    age_years: item.age_years ?? patient.age_years ?? null,
    mobile_number: item.mobile_number ?? patient.mobile_number ?? null,
    email: item.email ?? patient.email ?? null,
    test_code: item.test_code || `TEST-${index + 1}`,
    test_name: item.test_name || `Test ${index + 1}`,
    sample_type: item.sample_type || "Sample",
    container_type: item.container_type || "Container",
    barcode_value: item.barcode_value || `BC-${visitNumber}-${index + 1}`,
    specimen_status: item.specimen_status || "pending",
    rejection_reason: item.rejection_reason ?? null,
    tat_due_at: item.tat_due_at ?? null,
    service_category: item.service_category ?? "laboratory",
    method_name: item.method_name ?? null,
    unit: item.unit ?? null,
    reference_range_text: item.reference_range_text ?? null,
    priority: item.priority ?? "normal",
    result_status: item.result_status ?? "pending",
    result_text: item.result_text ?? null,
    numeric_value: item.numeric_value ?? null,
    abnormal_flag: item.abnormal_flag ?? null,
    critical_flag: item.critical_flag ?? false,
  };
}

function derivePatientFromItems(items: Array<Partial<WorkflowItem>>) {
  const firstItem = items[0];
  return {
    patient_id: firstItem?.patient_id || null,
    patient_name: firstItem?.patient_name || null,
    sex: firstItem?.sex ?? null,
    age_years: firstItem?.age_years ?? null,
    mobile_number: firstItem?.mobile_number ?? null,
    email: firstItem?.email ?? null,
  };
}

function normalizeBundle(raw: WorkflowBundle | LegacyCollectionBundle): WorkflowBundle {
  if ("patient" in raw && raw.patient) {
    const itemPatient = derivePatientFromItems(raw.items);
    const patient: WorkflowPatient = {
      patient_id: raw.patient.patient_id || itemPatient.patient_id || `PAT-${raw.visit_number}`,
      patient_name: raw.patient.patient_name || itemPatient.patient_name || "Walk In Patient",
      sex: raw.patient.sex ?? itemPatient.sex ?? null,
      age_years: raw.patient.age_years ?? itemPatient.age_years ?? null,
      mobile_number: raw.patient.mobile_number ?? itemPatient.mobile_number ?? null,
      email: raw.patient.email ?? itemPatient.email ?? null,
    };

    return {
      visit_number: raw.visit_number,
      patient,
      clinical_notes: raw.clinical_notes ?? null,
      diagnosis: raw.diagnosis ?? null,
      medication: raw.medication ?? null,
      items: raw.items.map((item, index) => normalizeWorkflowItem(item, raw.visit_number, patient, index)),
      created_at: raw.created_at,
      updated_at: raw.updated_at,
    };
  }

  const legacy = raw as LegacyCollectionBundle;
  const itemPatient = derivePatientFromItems(legacy.items);
  const patient: WorkflowPatient = {
    patient_id: itemPatient.patient_id || `PAT-${legacy.visit_number}`,
    patient_name: legacy.patient_name || itemPatient.patient_name || "Walk In Patient",
    sex: itemPatient.sex ?? null,
    age_years: itemPatient.age_years ?? null,
    mobile_number: itemPatient.mobile_number ?? null,
    email: itemPatient.email ?? null,
  };

  return {
    visit_number: legacy.visit_number,
    patient,
    clinical_notes: null,
    diagnosis: null,
    medication: null,
    items: legacy.items.map((item, index) => normalizeWorkflowItem(item, legacy.visit_number, patient, index)),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function loadWorkflowBundle(): WorkflowBundle | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const normalized = normalizeBundle(JSON.parse(raw) as WorkflowBundle | LegacyCollectionBundle);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return null;
  }
}

export function saveWorkflowBundle(bundle: WorkflowBundle) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeBundle({
    ...bundle,
    created_at: bundle.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(
    new CustomEvent(WORKFLOW_UPDATED_EVENT, {
      detail: {
        visit_number: normalized.visit_number,
        updated_at: normalized.updated_at,
      },
    }),
  );
}

export function updateWorkflowBundle(
  updater: (current: WorkflowBundle | null) => WorkflowBundle | null,
): WorkflowBundle | null {
  const current = loadWorkflowBundle();
  const next = updater(current);
  if (next) {
    saveWorkflowBundle(next);
    return next;
  }
  return null;
}
