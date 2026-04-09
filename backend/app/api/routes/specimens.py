from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.contracts import SpecimenUpdateRequest, SpecimenUpdateResponse, SpecimenWorklistItem
from app.core.auth_deps import CurrentUser, get_current_user
from app.db.session import get_db
from app.services.specimen_service import SpecimenService

router = APIRouter(prefix="/specimens", tags=["specimens"])


@router.get("/worklist", response_model=list[SpecimenWorklistItem])
def specimen_worklist(
    visit_number: str | None = Query(default=None),
    barcode_value: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[SpecimenWorklistItem]:
    return SpecimenService.get_worklist(db, visit_number=visit_number, barcode_value=barcode_value)


@router.patch("/status", response_model=SpecimenUpdateResponse)
def update_specimen(
    payload: SpecimenUpdateRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> SpecimenUpdateResponse:
    try:
        return SpecimenService.update_specimen(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
