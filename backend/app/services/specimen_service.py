from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.api.contracts import SpecimenUpdateRequest, SpecimenUpdateResponse, SpecimenWorklistItem
from app.models.models import OrderTest, Patient, Specimen, SpecimenEvent, SpecimenStatus, TestCatalog, Visit, VisitStatus


class SpecimenService:
    @staticmethod
    def get_worklist(db: Session, visit_number: str | None = None, barcode_value: str | None = None) -> list[SpecimenWorklistItem]:
        query = (
            db.query(Specimen, OrderTest, Visit, Patient, TestCatalog)
            .join(OrderTest, Specimen.order_test_id == OrderTest.id)
            .join(Visit, OrderTest.visit_id == Visit.id)
            .join(Patient, OrderTest.patient_id == Patient.id)
            .join(TestCatalog, OrderTest.test_id == TestCatalog.id)
            .order_by(Visit.visit_date.desc())
        )

        if visit_number:
            query = query.filter(Visit.visit_number == visit_number)
        if barcode_value:
            query = query.filter(OrderTest.barcode_value == barcode_value)

        rows = query.all()
        return [
            SpecimenWorklistItem(
                specimen_id=specimen.id,
                specimen_number=specimen.specimen_number,
                visit_number=visit.visit_number,
                patient_id=patient.id,
                patient_name=patient.full_name,
                test_code=test.test_code,
                test_name=test.test_name,
                sample_type=order_test.sample_type,
                container_type=order_test.container_type,
                barcode_value=order_test.barcode_value,
                specimen_status=specimen.specimen_status.value,
                rejection_reason=specimen.rejection_reason,
                tat_due_at=order_test.tat_due_at,
            )
            for specimen, order_test, visit, patient, test in rows
        ]

    @staticmethod
    def update_specimen(db: Session, payload: SpecimenUpdateRequest) -> SpecimenUpdateResponse:
        row = (
            db.query(Specimen, OrderTest, Visit)
            .join(OrderTest, Specimen.order_test_id == OrderTest.id)
            .join(Visit, OrderTest.visit_id == Visit.id)
            .filter(OrderTest.barcode_value == payload.barcode_value)
            .first()
        )
        if not row:
            raise ValueError("Specimen not found for barcode")

        specimen, order_test, visit = row
        previous_status = specimen.specimen_status
        new_status = SpecimenStatus(payload.specimen_status)
        now = datetime.now(timezone.utc)

        specimen.specimen_status = new_status
        specimen.rejection_reason = payload.rejection_reason
        specimen.updated_at = now

        if new_status == SpecimenStatus.COLLECTED:
            specimen.collected_at = now
            order_test.order_status = VisitStatus.COLLECTED
        elif new_status == SpecimenStatus.RECEIVED:
            specimen.received_at = now
            order_test.order_status = VisitStatus.COLLECTED
        elif new_status == SpecimenStatus.REJECTED:
            specimen.rejected_at = now
            order_test.order_status = VisitStatus.BILLED

        db.add(
            SpecimenEvent(
                id=str(uuid4()),
                specimen_id=specimen.id,
                event_name="status_updated",
                from_status=previous_status,
                to_status=new_status,
                remarks=payload.rejection_reason,
            )
        )

        sibling_statuses = [item for item, in db.query(Specimen.specimen_status).join(OrderTest, Specimen.order_test_id == OrderTest.id).filter(OrderTest.visit_id == visit.id).all()]
        if sibling_statuses and all(status in {SpecimenStatus.COLLECTED, SpecimenStatus.RECEIVED, SpecimenStatus.REJECTED} for status in sibling_statuses):
            visit.visit_status = VisitStatus.COLLECTED

        db.commit()
        db.refresh(specimen)

        return SpecimenUpdateResponse(
            specimen_id=specimen.id,
            barcode_value=payload.barcode_value,
            specimen_status=specimen.specimen_status.value,
            rejection_reason=specimen.rejection_reason,
            updated_at=specimen.updated_at,
        )
