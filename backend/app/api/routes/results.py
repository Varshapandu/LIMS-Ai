from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.contracts import (
    ApprovalCaseResponse,
    ReportDetailResponse,
    ReportResponse,
    ResultEntryRequest,
    ResultEntryResponse,
    ResultWorklistItem,
    VisitApprovalRequest,
    VisitApprovalResponse,
)
from app.core.auth_deps import CurrentUser, get_current_user
from app.db.session import get_db
from app.services.approval_service import ApprovalService
from app.services.report_generation_service import ReportGenerationService
from app.services.result_service import ResultService

router = APIRouter(prefix="/results", tags=["results"])


@router.get("/worklist", response_model=list[ResultWorklistItem])
def result_worklist(
    visit_number: str | None = Query(default=None),
    barcode_value: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[ResultWorklistItem]:
    return ResultService.get_worklist(db, visit_number=visit_number, barcode_value=barcode_value)


@router.get("/approval-case", response_model=ApprovalCaseResponse)
def approval_case(
    visit_number: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ApprovalCaseResponse:
    try:
        return ApprovalService.get_approval_case(db, visit_number=visit_number, current_user=current_user)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/entry", response_model=ResultEntryResponse)
def save_result(
    payload: ResultEntryRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ResultEntryResponse:
    try:
        return ResultService.save_result(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/approve", response_model=VisitApprovalResponse)
def approve_visit_results(
    payload: VisitApprovalRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> VisitApprovalResponse:
    try:
        return ApprovalService.approve_visit_results(
            db,
            payload.visit_number,
            action=payload.action,
            doctor_note=payload.doctor_note,
            intervention_keys=payload.intervention_keys,
            current_user=current_user,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/reports/generate", response_model=ReportResponse)
def generate_report(
    visit_number: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ReportResponse:
    try:
        return ReportGenerationService.generate_report(db, visit_number)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/reports/{visit_number}", response_model=ReportDetailResponse)
def get_report_detail(
    visit_number: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ReportDetailResponse:
    try:
        return ReportGenerationService.get_report_detail(db, visit_number)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
