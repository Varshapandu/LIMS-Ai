/**
 * Shared API response types used across multiple pages.
 * Centralised here to eliminate inline type duplication (analysis item 4.5).
 */

/* ─── Dashboard ─── */

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

export type DashboardOverview = {
  total_patients: number;
  revenue: string;
  pending_tests: number;
  completed_tests: number;
  critical_alerts: number;
  today_visits: number;
  reported_visits: number;
};

export type DashboardCapacity = {
  utilization_percent: string;
  remaining_percent: string;
  active_tests: number;
  completed_tests: number;
};

export type DashboardSnapshot = {
  overview: DashboardOverview;
  daily_trends: DashboardTrendPoint[];
  category_distribution: DashboardCategoryItem[];
  capacity: DashboardCapacity;
  alerts: DashboardAlertItem[];
};

/* ─── Billing ─── */

export type InvoiceLine = {
  test_code: string;
  test_name: string;
  price: number;
  quantity: number;
  priority: string;
};

export type InvoiceSummary = {
  invoice_id: string;
  invoice_number: string;
  visit_id: string;
  visit_number: string;
  patient_id: string;
  patient_name: string;
  gross_amount: number;
  discount_amount: number;
  net_amount: number;
  paid_amount: number;
  due_amount: number;
  payment_status: string;
  created_at: string;
};

/* ─── Results / Worklist ─── */

export type WorklistItem = {
  order_test_id: string;
  visit_number: string;
  patient_name: string;
  patient_code: string;
  test_code: string;
  test_name: string;
  barcode_value: string;
  sample_type: string;
  specimen_status: string;
  result_status: string;
  order_status: string;
  priority: string;
  result_text: string | null;
  numeric_value: number | null;
  unit: string | null;
  reference_range_text: string | null;
  abnormal_flag: string | null;
  critical_flag: boolean;
};

/* ─── Approvals ─── */

export type ApprovalAnalyte = {
  order_test_id: string;
  test_code: string;
  analyte_name: string;
  method_name: string | null;
  result_status: string;
  result_text: string | null;
  numeric_value: number | null;
  unit: string | null;
  reference_range_text: string | null;
  abnormal_flag: string | null;
  critical_flag: boolean;
  status_label: string;
  status_tone: string;
};

/* ─── Reports ─── */

export type ReportItem = {
  report_number: string;
  visit_number: string;
  patient_name: string;
  generated_at: string;
  status: string;
};

/* ─── Common ─── */

export type ApiError = {
  detail: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};
