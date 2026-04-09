from __future__ import annotations

from uuid import uuid4

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.contracts import CreatePatientRequest, PatientResponse, UpdatePatientRequest
from app.models.models import Patient, SexType


class PatientService:
    @staticmethod
    def create_patient(db: Session, payload: CreatePatientRequest) -> PatientResponse:
        count = db.query(func.count(Patient.id)).scalar() or 0
        patient_code = f"PAT-{1000 + count + 1}"
        full_name = " ".join(part for part in [payload.first_name.strip(), payload.last_name.strip() if payload.last_name else None] if part)
        patient = Patient(
            id=str(uuid4()),
            patient_code=patient_code,
            first_name=payload.first_name.strip(),
            last_name=payload.last_name.strip() if payload.last_name else None,
            full_name=full_name,
            sex=SexType(payload.sex),
            age_years=payload.age_years,
            mobile_number=payload.mobile_number,
            email=str(payload.email).strip().lower() if payload.email else None,
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return PatientResponse(
            id=patient.id,
            patient_code=patient.patient_code,
            full_name=patient.full_name,
            sex=patient.sex.value,
            age_years=patient.age_years,
            mobile_number=patient.mobile_number,
            email=patient.email,
        )

    @staticmethod
    def update_patient(db: Session, patient_id: str, payload: UpdatePatientRequest) -> PatientResponse:
        patient = db.query(Patient).filter(Patient.id == patient_id, Patient.is_deleted == False).first()  # noqa: E712
        if not patient:
            raise ValueError("Patient not found")

        patient.mobile_number = payload.mobile_number
        patient.email = str(payload.email).strip().lower() if payload.email else None
        db.commit()
        db.refresh(patient)

        return PatientResponse(
            id=patient.id,
            patient_code=patient.patient_code,
            full_name=patient.full_name,
            sex=patient.sex.value,
            age_years=patient.age_years,
            mobile_number=patient.mobile_number,
            email=patient.email,
        )
