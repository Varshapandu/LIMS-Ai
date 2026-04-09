from __future__ import annotations

import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class SoftDeleteMixin:
    """Mixin that adds soft-delete columns to any model.

    Instead of physically deleting rows, set ``is_deleted = True`` and
    ``deleted_at = datetime.now(timezone.utc)``.  Queries should filter
    with ``.filter(Model.is_deleted == False)`` to exclude soft-deleted rows.
    """

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class AuditLog(Base):
    """Generic audit log for tracking state transitions across all entities.

    Every significant mutation (create, update, delete, approve, …) should
    write an entry here for compliance and traceability.
    """

    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    field_name: Mapped[str | None] = mapped_column(String(120))
    old_value: Mapped[str | None] = mapped_column(Text())
    new_value: Mapped[str | None] = mapped_column(Text())
    actor_id: Mapped[str | None] = mapped_column(String(36))
    actor_name: Mapped[str | None] = mapped_column(String(180))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    LOCKED = "locked"


class SexType(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"
    UNKNOWN = "unknown"


class VisitStatus(str, enum.Enum):
    DRAFT = "draft"
    BILLED = "billed"
    COLLECTED = "collected"
    PROCESSING = "processing"
    COMPLETED = "completed"
    APPROVED = "approved"
    REPORTED = "reported"
    CANCELLED = "cancelled"


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    PARTIAL = "partial"
    REFUNDED = "refunded"
    CANCELLED = "cancelled"


class SpecimenStatus(str, enum.Enum):
    PENDING = "pending"
    COLLECTED = "collected"
    RECEIVED = "received"
    PROCESSING = "processing"
    REJECTED = "rejected"
    DISPOSED = "disposed"


class ResultStatus(str, enum.Enum):
    PENDING = "pending"
    ENTERED = "entered"
    VERIFIED = "verified"
    APPROVED = "approved"
    AMENDED = "amended"


class ReportStatus(str, enum.Enum):
    DRAFT = "draft"
    GENERATED = "generated"
    APPROVED = "approved"
    ISSUED = "issued"
    REVISED = "revised"


class ServiceCategory(str, enum.Enum):
    LABORATORY = "laboratory"
    RADIOLOGY = "radiology"
    CARDIOLOGY = "cardiology"


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id"), nullable=False)
    department_id: Mapped[str | None] = mapped_column(ForeignKey("departments.id"))
    employee_code: Mapped[str | None] = mapped_column(String(40), unique=True)
    full_name: Mapped[str] = mapped_column(String(180), nullable=False)
    email: Mapped[str] = mapped_column(String(180), unique=True, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30))
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[UserStatus] = mapped_column(Enum(UserStatus), default=UserStatus.ACTIVE, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    role: Mapped[Role] = relationship()
    department: Mapped[Department | None] = relationship()


class Patient(SoftDeleteMixin, Base):
    __tablename__ = "patients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    patient_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String(120), nullable=False)
    middle_name: Mapped[str | None] = mapped_column(String(120))
    last_name: Mapped[str | None] = mapped_column(String(120))
    full_name: Mapped[str] = mapped_column(String(240), nullable=False, index=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date())
    age_years: Mapped[int | None] = mapped_column(Integer)
    age_months: Mapped[int | None] = mapped_column(Integer)
    sex: Mapped[SexType] = mapped_column(Enum(SexType), default=SexType.UNKNOWN, nullable=False)
    mobile_number: Mapped[str | None] = mapped_column(String(30), index=True)
    email: Mapped[str | None] = mapped_column(String(180))
    address_line1: Mapped[str | None] = mapped_column(String(220))
    address_line2: Mapped[str | None] = mapped_column(String(220))
    city: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str | None] = mapped_column(String(100))
    postal_code: Mapped[str | None] = mapped_column(String(20))
    national_id: Mapped[str | None] = mapped_column(String(80))
    external_mrn: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ReferralSource(Base):
    __tablename__ = "referral_sources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    code: Mapped[str | None] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), default="doctor", nullable=False)
    contact_person: Mapped[str | None] = mapped_column(String(180))
    phone: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(180))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class TestCatalog(Base):
    __tablename__ = "test_catalog"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    department_id: Mapped[str] = mapped_column(ForeignKey("departments.id"), nullable=False)
    service_category: Mapped[ServiceCategory] = mapped_column(Enum(ServiceCategory), default=ServiceCategory.LABORATORY, nullable=False)
    test_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    test_name: Mapped[str] = mapped_column(String(220), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(80))
    sample_type: Mapped[str] = mapped_column(String(80), nullable=False)
    container_type: Mapped[str] = mapped_column(String(80), nullable=False)
    method_name: Mapped[str | None] = mapped_column(String(120))
    unit: Mapped[str | None] = mapped_column(String(60))
    reference_range_text: Mapped[str | None] = mapped_column(String(180))
    turnaround_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    critical_low: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    critical_high: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    is_calculated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    formula_expression: Mapped[str | None] = mapped_column(Text())
    barcode_prefix: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    department: Mapped[Department] = relationship()


class Visit(SoftDeleteMixin, Base):
    __tablename__ = "visits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), nullable=False)
    referral_source_id: Mapped[str | None] = mapped_column(ForeignKey("referral_sources.id"))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    visit_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    visit_type: Mapped[str] = mapped_column(String(40), default="op", nullable=False)
    visit_status: Mapped[VisitStatus] = mapped_column(Enum(VisitStatus), default=VisitStatus.DRAFT, nullable=False)
    visit_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    clinical_notes: Mapped[str | None] = mapped_column(Text())
    symptoms_text: Mapped[str | None] = mapped_column(Text())
    provisional_diagnosis: Mapped[str | None] = mapped_column(Text())
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    net_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    due_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    patient: Mapped[Patient] = relationship()


class Invoice(SoftDeleteMixin, Base):
    __tablename__ = "invoices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    visit_id: Mapped[str] = mapped_column(ForeignKey("visits.id"), nullable=False)
    invoice_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    invoice_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    net_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    payment_status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus), default=PaymentStatus.PENDING, nullable=False)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id"), nullable=False)
    source_type: Mapped[str] = mapped_column(String(40), default="test", nullable=False)
    source_id: Mapped[str | None] = mapped_column(String(36))
    item_code: Mapped[str | None] = mapped_column(String(50))
    item_name: Mapped[str] = mapped_column(String(220), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id"), nullable=False)
    payment_reference: Mapped[str | None] = mapped_column(String(80))
    payment_mode: Mapped[str] = mapped_column(String(40), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus), default=PaymentStatus.PAID, nullable=False)
    received_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    remarks: Mapped[str | None] = mapped_column(Text())


class OrderHeader(Base):
    __tablename__ = "order_headers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    visit_id: Mapped[str] = mapped_column(ForeignKey("visits.id"), nullable=False)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), nullable=False)
    order_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    ordered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ordered_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    status: Mapped[VisitStatus] = mapped_column(Enum(VisitStatus), default=VisitStatus.BILLED, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class OrderTest(Base):
    __tablename__ = "order_tests"
    __table_args__ = (UniqueConstraint("barcode_value", name="uq_order_tests_barcode_value"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("order_headers.id"), nullable=False)
    visit_id: Mapped[str] = mapped_column(ForeignKey("visits.id"), nullable=False)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), nullable=False)
    test_id: Mapped[str] = mapped_column(ForeignKey("test_catalog.id"), nullable=False)
    barcode_value: Mapped[str] = mapped_column(String(80), nullable=False)
    sample_type: Mapped[str] = mapped_column(String(80), nullable=False)
    container_type: Mapped[str] = mapped_column(String(80), nullable=False)
    priority: Mapped[str] = mapped_column(String(30), default="normal", nullable=False)
    tat_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    order_status: Mapped[VisitStatus] = mapped_column(Enum(VisitStatus), default=VisitStatus.BILLED, nullable=False)
    result_status: Mapped[ResultStatus] = mapped_column(Enum(ResultStatus), default=ResultStatus.PENDING, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    test: Mapped[TestCatalog] = relationship()


class Specimen(Base):
    __tablename__ = "specimens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    order_test_id: Mapped[str] = mapped_column(ForeignKey("order_tests.id"), unique=True, nullable=False)
    specimen_number: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    specimen_status: Mapped[SpecimenStatus] = mapped_column(Enum(SpecimenStatus), default=SpecimenStatus.PENDING, nullable=False)
    collected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    collected_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    rejection_reason: Mapped[str | None] = mapped_column(Text())
    remarks: Mapped[str | None] = mapped_column(Text())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class SpecimenEvent(Base):
    __tablename__ = "specimen_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    specimen_id: Mapped[str] = mapped_column(ForeignKey("specimens.id"), nullable=False)
    event_name: Mapped[str] = mapped_column(String(80), nullable=False)
    from_status: Mapped[SpecimenStatus | None] = mapped_column(Enum(SpecimenStatus))
    to_status: Mapped[SpecimenStatus | None] = mapped_column(Enum(SpecimenStatus))
    event_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    event_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    remarks: Mapped[str | None] = mapped_column(Text())


class ReferenceRange(SoftDeleteMixin, Base):
    __tablename__ = "reference_ranges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    test_id: Mapped[str] = mapped_column(ForeignKey("test_catalog.id"), nullable=False, index=True)
    sex: Mapped[SexType | None] = mapped_column(Enum(SexType))
    min_age_years: Mapped[int | None] = mapped_column(Integer)
    max_age_years: Mapped[int | None] = mapped_column(Integer)
    unit: Mapped[str | None] = mapped_column(String(60))
    reference_range_text: Mapped[str | None] = mapped_column(String(180))
    method_name: Mapped[str | None] = mapped_column(String(120))
    critical_low: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    critical_high: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ResultRecord(Base):
    __tablename__ = "result_records"
    __table_args__ = (CheckConstraint("numeric_value IS NULL OR numeric_value >= 0", name="ck_result_numeric_non_negative"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    order_test_id: Mapped[str] = mapped_column(ForeignKey("order_tests.id"), unique=True, nullable=False)
    specimen_id: Mapped[str | None] = mapped_column(ForeignKey("specimens.id"))
    entered_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    verified_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    result_status: Mapped[ResultStatus] = mapped_column(Enum(ResultStatus), default=ResultStatus.PENDING, nullable=False)
    result_text: Mapped[str | None] = mapped_column(Text())
    numeric_value: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    unit: Mapped[str | None] = mapped_column(String(60))
    reference_range_text: Mapped[str | None] = mapped_column(String(180))
    abnormal_flag: Mapped[str | None] = mapped_column(String(20))
    critical_flag: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    entered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    comments: Mapped[str | None] = mapped_column(Text())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Report(SoftDeleteMixin, Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    visit_id: Mapped[str] = mapped_column(ForeignKey("visits.id"), nullable=False)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), nullable=False)
    report_number: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    report_status: Mapped[ReportStatus] = mapped_column(Enum(ReportStatus), default=ReportStatus.DRAFT, nullable=False)
    file_url: Mapped[str | None] = mapped_column(Text())
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_via: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
