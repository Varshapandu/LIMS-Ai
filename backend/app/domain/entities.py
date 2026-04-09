from __future__ import annotations

from enum import Enum

from pydantic import BaseModel


class RoleCode(str, Enum):
    ADMIN = "admin"
    LAB_TECHNICIAN = "lab_technician"
    DOCTOR = "doctor"


class VisitStatus(str, Enum):
    DRAFT = "draft"
    BILLED = "billed"
    COLLECTED = "collected"
    PROCESSING = "processing"
    COMPLETED = "completed"
    APPROVED = "approved"
    REPORTED = "reported"
    CANCELLED = "cancelled"


class SpecimenStatus(str, Enum):
    PENDING = "pending"
    COLLECTED = "collected"
    RECEIVED = "received"
    PROCESSING = "processing"
    REJECTED = "rejected"
    DISPOSED = "disposed"


class ResultStatus(str, Enum):
    PENDING = "pending"
    ENTERED = "entered"
    VERIFIED = "verified"
    APPROVED = "approved"
    AMENDED = "amended"


class PatientSummary(BaseModel):
    id: str
    patient_code: str
    full_name: str
    mobile_number: str | None = None


class VisitSummary(BaseModel):
    id: str
    visit_number: str
    patient_id: str
    visit_status: VisitStatus


class OrderTestSummary(BaseModel):
    id: str
    barcode_value: str
    test_name: str
    sample_type: str
    container_type: str
    result_status: ResultStatus
