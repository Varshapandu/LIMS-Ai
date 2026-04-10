from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.contracts import (
    CreateInvoiceRequest,
    CreateInvoiceResponse,
    InvoiceSummaryResponse,
    PaymentRequest,
    PaymentResponse,
    RazorpayOrderRequest,
    RazorpayOrderResponse,
    RazorpayVerifyRequest,
    RazorpayVerifyResponse,
)
from app.core.auth_deps import CurrentUser, get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.services.billing_service import BillingService
from app.services.razorpay_service import RazorpayService

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


# ---------------------------------------------------------------------------
# Razorpay Payment Gateway
# ---------------------------------------------------------------------------


@router.post("/razorpay/create-order", response_model=RazorpayOrderResponse)
def create_razorpay_order(
    payload: RazorpayOrderRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> RazorpayOrderResponse:
    """Create a Razorpay order for an existing LIMS invoice."""
    if not RazorpayService.is_configured():
        raise HTTPException(status_code=503, detail="Razorpay is not configured on this server.")

    # Fetch the invoice to get patient details for prefill
    try:
        summary = BillingService.get_invoice_summary(db, payload.invoice_number)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if summary.due_amount <= 0:
        raise HTTPException(status_code=400, detail="Invoice is already fully paid.")

    # Use the requested amount (could be partial), but cap at due amount
    amount = min(payload.amount, summary.due_amount)

    try:
        order = RazorpayService.create_order(amount=amount, invoice_number=payload.invoice_number)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Razorpay order creation failed: {exc}") from exc

    # Fetch patient details for Razorpay prefill
    from app.models.models import Patient, Visit, Invoice

    row = (
        db.query(Patient)
        .join(Visit, Visit.patient_id == Patient.id)
        .join(Invoice, Invoice.visit_id == Visit.id)
        .filter(Invoice.invoice_number == payload.invoice_number)
        .first()
    )

    return RazorpayOrderResponse(
        razorpay_order_id=order["id"],
        amount=order["amount"],
        currency=order.get("currency", "INR"),
        key_id=settings.razorpay_key_id,
        invoice_number=payload.invoice_number,
        patient_name=row.full_name if row else summary.patient_name,
        patient_email=row.email if row else None,
        patient_phone=row.mobile_number if row else None,
    )


@router.post("/razorpay/verify-payment", response_model=RazorpayVerifyResponse)
def verify_razorpay_payment(
    payload: RazorpayVerifyRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> RazorpayVerifyResponse:
    """Verify Razorpay payment signature and record the payment in the LIMS."""
    if not RazorpayService.is_configured():
        raise HTTPException(status_code=503, detail="Razorpay is not configured on this server.")

    # Verify the signature
    is_valid = RazorpayService.verify_payment_signature(
        razorpay_order_id=payload.razorpay_order_id,
        razorpay_payment_id=payload.razorpay_payment_id,
        razorpay_signature=payload.razorpay_signature,
    )

    if not is_valid:
        return RazorpayVerifyResponse(
            verified=False,
            message="Payment signature verification failed. The payment may not be genuine.",
        )

    # Record the payment using existing billing service
    try:
        payment_result = BillingService.record_payment(
            db,
            PaymentRequest(
                invoice_number=payload.invoice_number,
                amount=payload.amount,
                payment_mode="razorpay",
                payment_reference=payload.razorpay_payment_id,
                remarks=f"Razorpay Order: {payload.razorpay_order_id}",
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return RazorpayVerifyResponse(
        verified=True,
        payment_id=payment_result.payment_id,
        payment_reference=payment_result.payment_reference,
        payment_status=payment_result.payment_status,
        paid_amount=payment_result.paid_amount,
        due_amount=payment_result.due_amount,
        message="Payment verified and recorded successfully.",
    )
