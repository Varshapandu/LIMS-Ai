from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from sqlalchemy.orm import Session

from app.api.contracts import CreateInvoiceRequest, InvoiceSummaryResponse, PaymentRequest, PaymentResponse
from app.models.models import (
    Invoice,
    InvoiceItem,
    OrderHeader,
    OrderTest,
    Patient,
    Payment,
    PaymentStatus,
    Specimen,
    SpecimenEvent,
    SpecimenStatus,
    TestCatalog,
    Visit,
    VisitStatus,
)


@dataclass
class BillingResult:
    patient_id: str
    visit_id: str
    visit_number: str
    invoice_id: str
    invoice_number: str
    order_id: str
    order_number: str
    gross_amount: Decimal
    discount_amount: Decimal
    net_amount: Decimal
    barcodes: list[str]
    created_at: datetime


class BillingService:
    @staticmethod
    def create_invoice(db: Session, payload: CreateInvoiceRequest) -> BillingResult:
        patient = db.query(Patient).filter(Patient.id == payload.patient_id).first()
        if not patient:
            raise ValueError("Patient not found")

        tests = db.query(TestCatalog).filter(TestCatalog.test_code.in_([line.test_code for line in payload.lines])).all()
        test_map = {test.test_code: test for test in tests}

        missing = [line.test_code for line in payload.lines if line.test_code not in test_map]
        if missing:
            raise ValueError(f"Unknown test codes: {', '.join(missing)}")

        gross = sum((line.price * line.quantity for line in payload.lines), start=Decimal("0.00"))
        net = gross - payload.discount_amount

        now = datetime.now(UTC)
        visit_number = f"VIS-{now:%Y%m%d}-{uuid4().hex[:6].upper()}"
        invoice_number = f"INV-{now:%Y%m%d}-{uuid4().hex[:6].upper()}"
        order_number = f"ORD-{now:%Y%m%d}-{uuid4().hex[:6].upper()}"

        visit = Visit(
            id=str(uuid4()),
            patient_id=patient.id,
            referral_source_id=payload.referral_source_id,
            visit_number=visit_number,
            visit_status=VisitStatus.BILLED,
            total_amount=gross,
            discount_amount=payload.discount_amount,
            net_amount=net,
            paid_amount=Decimal("0.00"),
            due_amount=net,
        )
        db.add(visit)
        db.flush()

        invoice = Invoice(
            id=str(uuid4()),
            visit_id=visit.id,
            invoice_number=invoice_number,
            gross_amount=gross,
            discount_amount=payload.discount_amount,
            net_amount=net,
            payment_status=PaymentStatus.PENDING,
        )
        db.add(invoice)
        db.flush()

        order = OrderHeader(
            id=str(uuid4()),
            visit_id=visit.id,
            patient_id=patient.id,
            order_number=order_number,
            status=VisitStatus.BILLED,
        )
        db.add(order)
        db.flush()

        barcodes: list[str] = []
        for line in payload.lines:
            test = test_map[line.test_code]
            line_total = line.price * line.quantity
            db.add(
                InvoiceItem(
                    id=str(uuid4()),
                    invoice_id=invoice.id,
                    source_type="test",
                    source_id=test.id,
                    item_code=test.test_code,
                    item_name=test.test_name,
                    quantity=line.quantity,
                    unit_price=line.price,
                    line_total=line_total,
                )
            )

            for _ in range(line.quantity):
                barcode = f"BC-{test.barcode_prefix or test.test_code}-{uuid4().hex[:8].upper()}"
                barcodes.append(barcode)
                order_test = OrderTest(
                    id=str(uuid4()),
                    order_id=order.id,
                    visit_id=visit.id,
                    patient_id=patient.id,
                    test_id=test.id,
                    barcode_value=barcode,
                    sample_type=test.sample_type,
                    container_type=test.container_type,
                    tat_due_at=now + timedelta(minutes=test.turnaround_minutes),
                    priority=line.priority,
                    order_status=VisitStatus.BILLED,
                )
                db.add(order_test)
                db.flush()

                specimen = Specimen(
                    id=str(uuid4()),
                    order_test_id=order_test.id,
                    specimen_number=f"SPM-{now:%Y%m%d}-{uuid4().hex[:6].upper()}",
                    specimen_status=SpecimenStatus.PENDING,
                )
                db.add(specimen)
                db.flush()

                db.add(
                    SpecimenEvent(
                        id=str(uuid4()),
                        specimen_id=specimen.id,
                        event_name="created_from_billing",
                        to_status=SpecimenStatus.PENDING,
                        remarks=f"Specimen created for barcode {barcode}",
                    )
                )

        db.commit()

        return BillingResult(
            patient_id=patient.id,
            visit_id=visit.id,
            visit_number=visit.visit_number,
            invoice_id=invoice.id,
            invoice_number=invoice.invoice_number,
            order_id=order.id,
            order_number=order.order_number,
            gross_amount=gross,
            discount_amount=payload.discount_amount,
            net_amount=net,
            barcodes=barcodes,
            created_at=now,
        )

    @staticmethod
    def get_invoice_summary(db: Session, invoice_number: str) -> InvoiceSummaryResponse:
        row = (
            db.query(Invoice, Visit, Patient)
            .join(Visit, Invoice.visit_id == Visit.id)
            .join(Patient, Visit.patient_id == Patient.id)
            .filter(Invoice.invoice_number == invoice_number)
            .first()
        )
        if not row:
            raise ValueError("Invoice not found")

        invoice, visit, patient = row
        return InvoiceSummaryResponse(
            invoice_id=invoice.id,
            invoice_number=invoice.invoice_number,
            visit_id=visit.id,
            visit_number=visit.visit_number,
            patient_id=patient.id,
            patient_name=patient.full_name,
            gross_amount=invoice.gross_amount,
            discount_amount=invoice.discount_amount,
            net_amount=invoice.net_amount,
            paid_amount=visit.paid_amount,
            due_amount=visit.due_amount,
            payment_status=invoice.payment_status.value,
            created_at=invoice.created_at,
        )

    @staticmethod
    def record_payment(db: Session, payload: PaymentRequest) -> PaymentResponse:
        row = (
            db.query(Invoice, Visit)
            .join(Visit, Invoice.visit_id == Visit.id)
            .filter(Invoice.invoice_number == payload.invoice_number)
            .first()
        )
        if not row:
            raise ValueError("Invoice not found")

        invoice, visit = row
        if payload.amount > visit.due_amount:
            raise ValueError("Payment amount cannot exceed due amount")

        now = datetime.now(UTC)
        payment_reference = payload.payment_reference or f"PAY-{now:%Y%m%d}-{uuid4().hex[:6].upper()}"
        new_paid_amount = (visit.paid_amount or Decimal("0.00")) + payload.amount
        new_due_amount = max(Decimal("0.00"), invoice.net_amount - new_paid_amount)

        if new_due_amount == Decimal("0.00"):
            payment_status = PaymentStatus.PAID
        elif new_paid_amount > Decimal("0.00"):
            payment_status = PaymentStatus.PARTIAL
        else:
            payment_status = PaymentStatus.PENDING

        payment = Payment(
            id=str(uuid4()),
            invoice_id=invoice.id,
            payment_reference=payment_reference,
            payment_mode=payload.payment_mode,
            amount=payload.amount,
            payment_status=payment_status,
            remarks=payload.remarks,
            paid_at=now,
        )
        db.add(payment)

        visit.paid_amount = new_paid_amount
        visit.due_amount = new_due_amount
        visit.updated_at = now
        invoice.payment_status = payment_status

        db.commit()
        db.refresh(payment)

        return PaymentResponse(
            payment_id=payment.id,
            invoice_number=invoice.invoice_number,
            payment_reference=payment.payment_reference or payment_reference,
            amount=payment.amount,
            payment_mode=payment.payment_mode,
            payment_status=payment.payment_status.value,
            paid_amount=visit.paid_amount,
            due_amount=visit.due_amount,
            paid_at=payment.paid_at,
        )
