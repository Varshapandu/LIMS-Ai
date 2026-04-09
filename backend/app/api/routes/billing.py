from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.contracts import CreateInvoiceRequest, CreateInvoiceResponse, InvoiceSummaryResponse, PaymentRequest, PaymentResponse
from app.core.auth_deps import CurrentUser, get_current_user
from app.db.session import get_db
from app.services.billing_service import BillingService

router = APIRouter(prefix="/billing", tags=["billing"])


@router.post("/invoices", response_model=CreateInvoiceResponse)
def create_invoice(
    payload: CreateInvoiceRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> CreateInvoiceResponse:
    try:
        result = BillingService.create_invoice(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return CreateInvoiceResponse(**result.__dict__)


@router.get("/invoices/{invoice_number}", response_model=InvoiceSummaryResponse)
def get_invoice_summary(
    invoice_number: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> InvoiceSummaryResponse:
    try:
        return BillingService.get_invoice_summary(db, invoice_number)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/payments", response_model=PaymentResponse)
def record_payment(
    payload: PaymentRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> PaymentResponse:
    try:
        return BillingService.record_payment(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
