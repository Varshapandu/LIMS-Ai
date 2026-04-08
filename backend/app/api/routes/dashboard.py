from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.contracts import DashboardOverviewResponse, DashboardSnapshotResponse
from app.db.session import get_db
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/overview", response_model=DashboardOverviewResponse)
def overview(db: Session = Depends(get_db)) -> DashboardOverviewResponse:
    return DashboardService.get_overview(db)


@router.get("/snapshot", response_model=DashboardSnapshotResponse)
def snapshot(db: Session = Depends(get_db)) -> DashboardSnapshotResponse:
    return DashboardService.get_snapshot(db)
