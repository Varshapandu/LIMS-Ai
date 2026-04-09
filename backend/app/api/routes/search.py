from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.contracts import SearchWorklistItem
from app.core.auth_deps import CurrentUser, get_current_user
from app.db.session import get_db
from app.services.search_service import SearchService

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/worklist", response_model=list[SearchWorklistItem])
def search_worklist(
    search: str | None = Query(default=None),
    patient_name: str | None = Query(default=None),
    visit_number: str | None = Query(default=None),
    barcode_value: str | None = Query(default=None),
    test_name: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[SearchWorklistItem]:
    return SearchService.search_worklist(
        db,
        search=search,
        patient_name=patient_name,
        visit_number=visit_number,
        barcode_value=barcode_value,
        test_name=test_name,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
    )
