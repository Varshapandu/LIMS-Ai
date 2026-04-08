from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

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
    last_name: Optional[str] = None
    sex: str
    age_years: Optional[int] = None
    mobile_number: Optional[str] = None
    email: Optional[EmailStr] = None


class PatientResponse(BaseModel):
    id: str
    patient_code: str
    full_name: str
    sex: str
    age_years: Optional[int] = None
    mobile_number: Optional[str] = None
    email: Optional[EmailStr] = None


class UpdatePatientRequest(BaseModel):
    mobile_number: Optional[str] = None
    email: Optional[EmailStr] = None


class BillingTestLine(BaseModel):
    test_code: str
    quantity: int = 1
    price: Decimal = Field(default=Decimal("0.00"))
    priority: str = "normal"


class CreateInvoiceRequest(BaseModel):
    patient_id: str
    referral_source_id: Optional[str] = None
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
    payment_reference: Optional[str] = None
    remarks: Optional[str] = None


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
    unit: Optional[str] = None
    reference_range_text: Optional[str] = None


class SearchWorklistItem(BaseModel):
    patient_id: str
    patient_code: str
    patient_name: str
    visit_id: str
    visit_number: str
    visit_date: datetime
    invoice_number: Optional[str] = None
    order_number: Optional[str] = None
    barcode_value: str
    test_code: str
    test_name: str
    department_name: str
    sample_type: str
    container_type: str
    specimen_status: str
    result_status: str
    report_status: Optional[str] = None
    tat_due_at: Optional[datetime] = None
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
    generated_at: Optional[datetime] = None
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
    rejection_reason: Optional[str] = None
    tat_due_at: Optional[datetime] = None


class SpecimenUpdateRequest(BaseModel):
    barcode_value: str
    specimen_status: str
    rejection_reason: Optional[str] = None


class SpecimenUpdateResponse(BaseModel):
    specimen_id: str
    barcode_value: str
    specimen_status: str
    rejection_reason: Optional[str] = None
    updated_at: datetime


class ResultWorklistItem(BaseModel):
    order_test_id: str
    visit_number: str
    patient_id: str
    patient_name: str
    age_years: Optional[int] = None
    sex: Optional[str] = None
    clinical_notes: Optional[str] = None
    barcode_value: str
    test_code: str
    test_name: str
    service_category: Optional[str] = None
    method_name: Optional[str] = None
    sample_type: str
    container_type: str
    priority: str = "normal"
    specimen_status: str
    result_status: str
    result_text: Optional[str] = None
    numeric_value: Optional[Decimal] = None
    unit: Optional[str] = None
    reference_range_text: Optional[str] = None
    tat_due_at: Optional[datetime] = None


class ApprovalPatientHistory(BaseModel):
    diagnosis: Optional[str] = None
    medication: Optional[str] = None
    recent_notes: Optional[str] = None


class ApprovalClinicalContext(BaseModel):
    fasting_status: str
    fasting_note: str
    last_review_at: Optional[datetime] = None
    last_review_note: str


class ApprovalTrendPoint(BaseModel):
    month: str
    value: Decimal


class ApprovalAnalyteItem(BaseModel):
    order_test_id: str
    test_code: str
    analyte_name: str
    method_name: Optional[str] = None
    result_status: str
    result_text: Optional[str] = None
    numeric_value: Optional[Decimal] = None
    unit: Optional[str] = None
    reference_range_text: Optional[str] = None
    abnormal_flag: Optional[str] = None
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
    age_years: Optional[int] = None
    sex: Optional[str] = None
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
    doctor_note: Optional[str] = None
    signature_enabled: bool = True
    payment_status: str = "pending"
    due_amount: Decimal = Field(default=Decimal("0.00"))


class ResultEntryRequest(BaseModel):
    order_test_id: str
    result_text: Optional[str] = None
    numeric_value: Optional[Decimal] = None
    result_status: str


class ResultEntryResponse(BaseModel):
    order_test_id: str
    result_status: str
    result_text: Optional[str] = None
    numeric_value: Optional[Decimal] = None
    approved_at: Optional[datetime] = None
    abnormal_flag: Optional[str] = None
    critical_flag: bool = False
    updated_at: datetime


class VisitApprovalRequest(BaseModel):
    visit_number: str
    action: str = "approve"
    doctor_note: Optional[str] = None
    intervention_keys: list[str] = Field(default_factory=list)


class VisitApprovalResponse(BaseModel):
    visit_number: str
    approved_tests: int
    visit_status: str
    approved_at: datetime
    action: str = "approve"
    doctor_note: Optional[str] = None
    report_number: Optional[str] = None
    report_emailed: bool = False
    report_emailed_to: Optional[str] = None
    report_email_error: Optional[str] = None
    message: Optional[str] = None


class ReportLineItem(BaseModel):
    barcode_value: str
    test_code: str
    test_name: str
    result_status: str
    result_text: Optional[str] = None
    numeric_value: Optional[Decimal] = None
    unit: Optional[str] = None
    reference_range_text: Optional[str] = None
    abnormal_flag: Optional[str] = None
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
    generated_at: Optional[datetime] = None
    created_at: datetime
    items: list[ReportLineItem]





class ReferenceRangeListItem(BaseModel):
    id: str
    test_id: str
    test_code: str
    test_name: str
    service_category: str
    sex: Optional[str] = None
    min_age_years: Optional[int] = None
    max_age_years: Optional[int] = None
    unit: Optional[str] = None
    reference_range_text: Optional[str] = None
    method_name: Optional[str] = None
    critical_low: Optional[Decimal] = None
    critical_high: Optional[Decimal] = None
    is_default: bool = False
    updated_at: datetime


class ReferenceRangeUpsertRequest(BaseModel):
    test_id: str
    sex: Optional[str] = None
    min_age_years: Optional[int] = None
    max_age_years: Optional[int] = None
    unit: Optional[str] = None
    reference_range_text: Optional[str] = None
    method_name: Optional[str] = None
    critical_low: Optional[Decimal] = None
    critical_high: Optional[Decimal] = None
    is_default: bool = False


class ReferenceRangeDeleteResponse(BaseModel):
    id: str
    deleted: bool = True
