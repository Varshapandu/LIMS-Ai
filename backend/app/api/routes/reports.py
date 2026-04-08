from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.contracts import ReportsAnalyticsResponse
from app.db.session import get_db
from app.services.reports_service import ReportsService

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/analytics", response_model=ReportsAnalyticsResponse)
def analytics(
    date_range_days: int = Query(default=30, ge=7, le=180),
    department: str | None = Query(default=None),
    test_type: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> ReportsAnalyticsResponse:
    try:
        return ReportsService.get_analytics(
            db,
            date_range_days=date_range_days,
            department=department,
            test_type=test_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
