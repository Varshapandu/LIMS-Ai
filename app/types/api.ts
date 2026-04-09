/**
 * Shared TypeScript types for the AI-LIMS application.
 *
 * These types are used across multiple pages to describe API request/response
 * shapes and common data structures. Centralising them here avoids duplication
 * and ensures consistency when the backend contracts evolve.
 */

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export type CatalogTestItem = {
  id: string;
  test_code: string;
  test_name: string;
  service_category: string;
  sample_type: string;
  container_type: string;
  department_name: string;
  price: string;
  turnaround_minutes: number;
  unit?: string | null;
  reference_range_text?: string | null;
  method_name?: string | null;
};

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

export type CreatedPatient = {
  id: string;
  patient_code: string;
  full_name: string;
  email?: string | null;
  mobile_number?: string | null;
};

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export type InvoiceResponse = {
  invoice_number: string;
  visit_number: string;
  order_number: string;
  gross_amount: string;
  discount_amount: string;
  net_amount: string;
  barcodes: string[];
};

export type InvoiceSummary = {
  invoice_number: string;
  visit_number: string;
  patient_name: string;
  gross_amount: string;
  discount_amount: string;
  net_amount: string;
  paid_amount: string;
  due_amount: string;
  payment_status: string;
};

export type PaymentResponse = {
  payment_reference: string;
  paid_amount: string;
  due_amount: string;
  payment_status: string;
};

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

export type CollectionWorklistItem = {
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
  priority?: string | null;
  rejection_reason?: string | null;
  tat_due_at?: string | null;
};

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type ResultWorklistItem = {
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

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type DashboardTrendPoint = {
  day_label: string;
  hematology: number;
  biochemistry: number;
  microbiology: number;
};

export type DashboardCategoryItem = {
  category: string;
  count: number;
  percentage: string;
};

export type DashboardAlertItem = {
  visit_number: string;
  patient_name: string;
  test_name: string;
  severity: string;
  message: string;
  triggered_at: string;
};

export type DashboardSnapshot = {
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

// ---------------------------------------------------------------------------
// Reference Ranges
// ---------------------------------------------------------------------------

export type ReferenceRangeItem = {
  id: string;
  test_id: string;
  test_code: string;
  test_name: string;
  service_category: string;
  sex?: string | null;
  min_age_years?: number | null;
  max_age_years?: number | null;
  unit?: string | null;
  reference_range_text?: string | null;
  method_name?: string | null;
  critical_low?: string | number | null;
  critical_high?: string | number | null;
  is_default: boolean;
  updated_at: string;
};
