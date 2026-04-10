"""Pydantic request / response contracts for the AI-LIMS API.

All optional fields use the modern ``T | None`` syntax (Python 3.10+)
instead of ``typing.Optional[T]``.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    full_name: str


class CreatePatientRequest(BaseModel):
    first_name: str
    last_name: str | None = None
    sex: str
    age_years: int | None = None
    mobile_number: str | None = None
    email: EmailStr | None = None


class PatientResponse(BaseModel):
    id: str
    patient_code: str
    full_name: str
    sex: str
    age_years: int | None = None
    mobile_number: str | None = None
    email: EmailStr | None = None


class UpdatePatientRequest(BaseModel):
    mobile_number: str | None = None
    email: EmailStr | None = None


class BillingTestLine(BaseModel):
    test_code: str
    quantity: int = 1
    price: Decimal = Field(default=Decimal("0.00"))
    priority: str = "normal"


class CreateInvoiceRequest(BaseModel):
    patient_id: str
    referral_source_id: str | None = None
    discount_amount: Decimal = Field(default=Decimal("0.00"))
    lines: list[BillingTestLine]


class CreateInvoiceResponse(BaseModel):
    patient_id: str
    visit_id: str
    visit_number: str
    invoice_id: str
    invoice_number: str
    order_id: str
    order_number: str
    gross_amount: Decimal
    discount_amount: Decimal
    net_amount: Decimal
    barcodes: list[str]
    created_at: datetime


class InvoiceSummaryResponse(BaseModel):
    invoice_id: str
    invoice_number: str
    visit_id: str
    visit_number: str
    patient_id: str
    patient_name: str
    gross_amount: Decimal
    discount_amount: Decimal
    net_amount: Decimal
    paid_amount: Decimal
    due_amount: Decimal
    payment_status: str
    created_at: datetime


class PaymentRequest(BaseModel):
    invoice_number: str
    amount: Decimal = Field(gt=Decimal("0.00"))
    payment_mode: str
    payment_reference: str | None = None
    remarks: str | None = None


class PaymentResponse(BaseModel):
    payment_id: str
    invoice_number: str
    payment_reference: str
    amount: Decimal
    payment_mode: str
    payment_status: str
    paid_amount: Decimal
    due_amount: Decimal
    paid_at: datetime


class CatalogTestItem(BaseModel):
    id: str
    test_code: str
    test_name: str
    service_category: str
    sample_type: str
    container_type: str
    department_name: str
    price: Decimal
    turnaround_minutes: int
    unit: str | None = None
    reference_range_text: str | None = None


class SearchWorklistItem(BaseModel):
    patient_id: str
    patient_code: str
    patient_name: str
    visit_id: str
    visit_number: str
    visit_date: datetime
    invoice_number: str | None = None
    order_number: str | None = None
    barcode_value: str
    test_code: str
    test_name: str
    department_name: str
    sample_type: str
    container_type: str
    specimen_status: str
    result_status: str
    report_status: str | None = None
    tat_due_at: datetime | None = None
    net_amount: Decimal = Field(default=Decimal("0.00"))


class DashboardTrendPoint(BaseModel):
    day_label: str
    hematology: int = 0
    biochemistry: int = 0
    microbiology: int = 0


class DashboardCategoryItem(BaseModel):
    category: str
    count: int
    percentage: Decimal


class DashboardCapacityResponse(BaseModel):
    utilization_percent: Decimal = Field(default=Decimal("0.00"))
    remaining_percent: Decimal = Field(default=Decimal("100.00"))
    active_tests: int = 0
    completed_tests: int = 0


class DashboardAlertItem(BaseModel):
    visit_number: str
    patient_name: str
    test_name: str
    severity: str
    message: str
    triggered_at: datetime


class DashboardOverviewResponse(BaseModel):
    total_patients: int = 0
    revenue: Decimal = Field(default=Decimal("0.00"))
    pending_tests: int = 0
    completed_tests: int = 0
    critical_alerts: int = 0
    today_visits: int = 0
    reported_visits: int = 0


class DashboardSnapshotResponse(BaseModel):
    overview: DashboardOverviewResponse
    daily_trends: list[DashboardTrendPoint]
    category_distribution: list[DashboardCategoryItem]
    capacity: DashboardCapacityResponse
    alerts: list[DashboardAlertItem]


class ReportsMetricCard(BaseModel):
    label: str
    value: Decimal | int
    change_percent: Decimal = Field(default=Decimal("0.00"))
    change_direction: str = "neutral"
    footnote: str
    accent: str = "teal"


class ReportsDepartmentPerformanceItem(BaseModel):
    department_code: str
    department_name: str
    actual_revenue: Decimal = Field(default=Decimal("0.00"))
    target_revenue: Decimal = Field(default=Decimal("0.00"))
    growth_percent: Decimal = Field(default=Decimal("0.00"))
    sample_count: int = 0


class ReportsBottleneckItem(BaseModel):
    stage: str
    backlog_count: int = 0
    throughput_percent: Decimal = Field(default=Decimal("0.00"))
    status: str
    tone: str
    note: str


class ReportsDistributionItem(BaseModel):
    label: str
    count: int = 0
    percentage: Decimal = Field(default=Decimal("0.00"))


class ReportsHighVolumeTestItem(BaseModel):
    test_code: str
    test_name: str
    department_name: str
    sample_type: str
    monthly_volume: int = 0
    avg_revenue_per_test: Decimal = Field(default=Decimal("0.00"))
    avg_tat_hours: Decimal = Field(default=Decimal("0.00"))
    abnormal_rate: Decimal = Field(default=Decimal("0.00"))
    efficiency_status: str
    efficiency_tone: str


class ReportsRecentReportItem(BaseModel):
    report_number: str
    visit_number: str
    patient_name: str
    department_name: str
    report_status: str
    generated_at: datetime | None = None
    item_count: int = 0


class ReportsFilterOption(BaseModel):
    label: str
    value: str


class ReportsAnalyticsResponse(BaseModel):
    generated_at: datetime
    date_range_days: int = 30
    selected_department: str = "all"
    selected_test_type: str = "all"
    available_departments: list[ReportsFilterOption]
    available_test_types: list[ReportsFilterOption]
    metric_cards: list[ReportsMetricCard]
    department_performance: list[ReportsDepartmentPerformanceItem]
    bottlenecks: list[ReportsBottleneckItem]
    gender_distribution: list[ReportsDistributionItem]
    age_distribution: list[ReportsDistributionItem]
    priority_distribution: list[ReportsDistributionItem]
    top_tests: list[ReportsHighVolumeTestItem]
    recent_reports: list[ReportsRecentReportItem]
    strategic_notes: list[str]


class SpecimenWorklistItem(BaseModel):
    specimen_id: str
    specimen_number: str
    visit_number: str
    patient_id: str
    patient_name: str
    test_code: str
    test_name: str
    sample_type: str
    container_type: str
    barcode_value: str
    specimen_status: str
    rejection_reason: str | None = None
    tat_due_at: datetime | None = None


class SpecimenUpdateRequest(BaseModel):
    barcode_value: str
    specimen_status: str
    rejection_reason: str | None = None


class SpecimenUpdateResponse(BaseModel):
    specimen_id: str
    barcode_value: str
    specimen_status: str
    rejection_reason: str | None = None
    updated_at: datetime


class ResultWorklistItem(BaseModel):
    order_test_id: str
    visit_number: str
    patient_id: str
    patient_name: str
    age_years: int | None = None
    sex: str | None = None
    clinical_notes: str | None = None
    barcode_value: str
    test_code: str
    test_name: str
    service_category: str | None = None
    method_name: str | None = None
    sample_type: str
    container_type: str
    priority: str = "normal"
    specimen_status: str
    result_status: str
    result_text: str | None = None
    numeric_value: Decimal | None = None
    unit: str | None = None
    reference_range_text: str | None = None
    tat_due_at: datetime | None = None


class ApprovalPatientHistory(BaseModel):
    diagnosis: str | None = None
    medication: str | None = None
    recent_notes: str | None = None


class ApprovalClinicalContext(BaseModel):
    fasting_status: str
    fasting_note: str
    last_review_at: datetime | None = None
    last_review_note: str


class ApprovalTrendPoint(BaseModel):
    month: str
    value: Decimal


class ApprovalAnalyteItem(BaseModel):
    order_test_id: str
    test_code: str
    analyte_name: str
    method_name: str | None = None
    result_status: str
    result_text: str | None = None
    numeric_value: Decimal | None = None
    unit: str | None = None
    reference_range_text: str | None = None
    abnormal_flag: str | None = None
    critical_flag: bool = False
    status_label: str
    status_tone: str


class ApprovalInterventionItem(BaseModel):
    key: str
    label: str
    checked: bool = False


class ApprovalCaseResponse(BaseModel):
    visit_number: str
    patient_id: str
    patient_name: str
    age_years: int | None = None
    sex: str | None = None
    case_label: str
    analysis_title: str
    critical_alerts: int = 0
    patient_history: ApprovalPatientHistory
    clinical_context: ApprovalClinicalContext
    analytes: list[ApprovalAnalyteItem]
    glucose_trend: list[ApprovalTrendPoint]
    interventions: list[ApprovalInterventionItem]
    review_status: str
    review_status_label: str
    validation_pending: bool = True
    analysis_time_label: str
    doctor_name: str
    doctor_role: str
    doctor_note: str | None = None
    signature_enabled: bool = True
    payment_status: str = "pending"
    due_amount: Decimal = Field(default=Decimal("0.00"))


class ResultEntryRequest(BaseModel):
    order_test_id: str
    result_text: str | None = None
    numeric_value: Decimal | None = None
    result_status: str


class ResultEntryResponse(BaseModel):
    order_test_id: str
    result_status: str
    result_text: str | None = None
    numeric_value: Decimal | None = None
    approved_at: datetime | None = None
    abnormal_flag: str | None = None
    critical_flag: bool = False
    updated_at: datetime


class VisitApprovalRequest(BaseModel):
    visit_number: str
    action: str = "approve"
    doctor_note: str | None = None
    intervention_keys: list[str] = Field(default_factory=list)


class VisitApprovalResponse(BaseModel):
    visit_number: str
    approved_tests: int
    visit_status: str
    approved_at: datetime
    action: str = "approve"
    doctor_note: str | None = None
    report_number: str | None = None
    report_emailed: bool = False
    report_emailed_to: str | None = None
    report_email_error: str | None = None
    message: str | None = None


class ReportLineItem(BaseModel):
    barcode_value: str
    test_code: str
    test_name: str
    result_status: str
    result_text: str | None = None
    numeric_value: Decimal | None = None
    unit: str | None = None
    reference_range_text: str | None = None
    abnormal_flag: str | None = None
    critical_flag: bool = False


class ReportResponse(BaseModel):
    report_id: str
    report_number: str
    visit_id: str
    visit_number: str
    patient_id: str
    report_status: str
    created_at: datetime


class ReportDetailResponse(BaseModel):
    report_id: str
    report_number: str
    visit_id: str
    visit_number: str
    patient_id: str
    patient_name: str
    report_status: str
    generated_at: datetime | None = None
    created_at: datetime
    items: list[ReportLineItem]


class ReferenceRangeListItem(BaseModel):
    id: str
    test_id: str
    test_code: str
    test_name: str
    service_category: str
    sex: str | None = None
    min_age_years: int | None = None
    max_age_years: int | None = None
    unit: str | None = None
    reference_range_text: str | None = None
    method_name: str | None = None
    critical_low: Decimal | None = None
    critical_high: Decimal | None = None
    is_default: bool = False
    updated_at: datetime


class ReferenceRangeUpsertRequest(BaseModel):
    test_id: str
    sex: str | None = None
    min_age_years: int | None = None
    max_age_years: int | None = None
    unit: str | None = None
    reference_range_text: str | None = None
    method_name: str | None = None
    critical_low: Decimal | None = None
    critical_high: Decimal | None = None
    is_default: bool = False


class ReferenceRangeDeleteResponse(BaseModel):
    id: str
    deleted: bool = True


class ResendReportEmailRequest(BaseModel):
    visit_number: str


class ResendReportEmailResponse(BaseModel):
    sent: bool
    delivered_to: str | None = None
    error: str | None = None
    attempts: int = 1


# ---------------------------------------------------------------------------
# Razorpay Payment Gateway
# ---------------------------------------------------------------------------

class RazorpayOrderRequest(BaseModel):
    """Request to create a Razorpay order for an invoice."""
    invoice_number: str
    amount: Decimal = Field(gt=Decimal("0.00"))


class RazorpayOrderResponse(BaseModel):
    """Response with Razorpay order details for the frontend checkout."""
    razorpay_order_id: str
    amount: int  # amount in paise
    currency: str = "INR"
    key_id: str
    invoice_number: str
    patient_name: str
    patient_email: str | None = None
    patient_phone: str | None = None


class RazorpayVerifyRequest(BaseModel):
    """Request to verify a Razorpay payment after checkout."""
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    invoice_number: str
    amount: Decimal = Field(gt=Decimal("0.00"))


class RazorpayVerifyResponse(BaseModel):
    """Response after verifying and recording a Razorpay payment."""
    verified: bool
    payment_id: str | None = None
    payment_reference: str | None = None
    payment_status: str | None = None
    paid_amount: Decimal | None = None
    due_amount: Decimal | None = None
    message: str
