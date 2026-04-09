from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.contracts import CreatePatientRequest, PatientResponse, UpdatePatientRequest
from app.core.auth_deps import CurrentUser, get_current_user
from app.db.session import get_db
from app.services.patient_service import PatientService

router = APIRouter(prefix="/patients", tags=["patients"])


@router.post("", response_model=PatientResponse)
def create_patient(
    payload: CreatePatientRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> PatientResponse:
    return PatientService.create_patient(db, payload)


@router.patch("/{patient_id}", response_model=PatientResponse)
def update_patient(
    patient_id: str,
    payload: UpdatePatientRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> PatientResponse:
    try:
        return PatientService.update_patient(db, patient_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
