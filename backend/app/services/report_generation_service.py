"""Report generation and delivery service — handles report creation,
report detail retrieval, and email dispatch with PDF attachment.

Extracted from ``ResultService`` to isolate the report lifecycle from
result entry and approval workflows.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from app.api.contracts import (
    ReportDetailResponse,
    ReportLineItem,
    ReportResponse,
)
from app.models.models import (
    OrderTest,
    Patient,
    Report,
    ReportStatus,
    ResultRecord,
    ResultStatus,
    TestCatalog,
    Visit,
    VisitStatus,
)
from app.services.mail_service import MailService
from app.services.report_pdf_service import ReportPdfService


class ReportGenerationService:
    """Handles report lifecycle: creation, detail retrieval, and email dispatch."""

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @staticmethod
    def generate_report(db: Session, visit_number: str) -> ReportResponse:
        """Create or refresh a report record for the given visit."""

        visit = db.query(Visit).filter(Visit.visit_number == visit_number, Visit.is_deleted == False).first()  # noqa: E712
        if not visit:
            raise ValueError("Visit not found")

        approved_tests = (
            db.query(OrderTest)
            .filter(OrderTest.visit_id == visit.id, OrderTest.result_status == ResultStatus.APPROVED)
            .count()
        )
        if approved_tests == 0:
            raise ValueError("No approved results available for report generation")

        report = db.query(Report).filter(Report.visit_id == visit.id, Report.is_deleted == False).first()  # noqa: E712
        now = datetime.now(UTC)

        if not report:
            report = Report(
                id=str(uuid4()),
                visit_id=visit.id,
                patient_id=visit.patient_id,
                report_number=f"REP-{now:%Y%m%d}-{uuid4().hex[:6].upper()}",
                report_status=ReportStatus.GENERATED,
                generated_at=now,
            )
            db.add(report)
        else:
            report.report_status = ReportStatus.GENERATED
            report.generated_at = now
            report.updated_at = now

        visit.visit_status = VisitStatus.REPORTED
        db.commit()
        db.refresh(report)

        return ReportResponse(
            report_id=report.id,
            report_number=report.report_number,
            visit_id=visit.id,
            visit_number=visit.visit_number,
            patient_id=visit.patient_id,
            report_status=report.report_status.value,
            created_at=report.created_at,
        )

    @staticmethod
    def get_report_detail(db: Session, visit_number: str) -> ReportDetailResponse:
        """Return the full report detail with line items for a visit."""

        row = (
            db.query(Report, Visit, Patient)
            .join(Visit, Report.visit_id == Visit.id)
            .join(Patient, Report.patient_id == Patient.id)
            .filter(Visit.visit_number == visit_number)
            .first()
        )
        if not row:
            raise ValueError("Report not found for visit")

        report, visit, patient = row
        item_rows = (
            db.query(OrderTest, TestCatalog, ResultRecord)
            .join(TestCatalog, OrderTest.test_id == TestCatalog.id)
            .outerjoin(ResultRecord, ResultRecord.order_test_id == OrderTest.id)
            .filter(OrderTest.visit_id == visit.id)
            .order_by(TestCatalog.test_name.asc())
            .all()
        )

        items = [
            ReportLineItem(
                barcode_value=order_test.barcode_value,
                test_code=test.test_code,
                test_name=test.test_name,
                result_status=(result.result_status.value if result else order_test.result_status.value),
                result_text=result.result_text if result else None,
                numeric_value=result.numeric_value if result else None,
                unit=result.unit if result else test.unit,
                reference_range_text=result.reference_range_text if result else test.reference_range_text,
                abnormal_flag=result.abnormal_flag if result else None,
                critical_flag=result.critical_flag if result else False,
            )
            for order_test, test, result in item_rows
        ]

        return ReportDetailResponse(
            report_id=report.id,
            report_number=report.report_number,
            visit_id=visit.id,
            visit_number=visit.visit_number,
            patient_id=patient.id,
            patient_name=patient.full_name,
            report_status=report.report_status.value,
            generated_at=report.generated_at,
            created_at=report.created_at,
            items=items,
        )

    @staticmethod
    def send_report_email(
        db: Session,
        visit_id: str,
        visit_number: str,
        report_number: str,
        approved_at: datetime,
        doctor_note: str | None,
    ):
        """Build and send the report email with PDF attachment.

        Returns the ``MailDeliveryResult`` from :class:`MailService`.
        """

        row = (
            db.query(Visit, Patient, Report)
            .join(Patient, Visit.patient_id == Patient.id)
            .join(Report, Report.visit_id == Visit.id)
            .filter(Visit.id == visit_id)
            .first()
        )
        if not row:
            return MailService.send_report_email(
                to_email=None,
                patient_name="Patient",
                visit_number=visit_number,
                report_number=report_number,
                approved_at_label=approved_at.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC"),
                doctor_note=doctor_note,
                analytes=[],
            )

        visit, patient, report = row
        item_rows = (
            db.query(OrderTest, TestCatalog, ResultRecord)
            .join(TestCatalog, OrderTest.test_id == TestCatalog.id)
            .outerjoin(ResultRecord, ResultRecord.order_test_id == OrderTest.id)
            .filter(OrderTest.visit_id == visit_id)
            .order_by(TestCatalog.test_name.asc())
            .all()
        )

        analytes: list[dict[str, str]] = []
        for _order_test, test, result in item_rows:
            raw_value = (
                str(result.numeric_value)
                if result and result.numeric_value is not None
                else (result.result_text if result and result.result_text else "Pending")
            )
            unit = result.unit if result and result.unit else test.unit
            analytes.append(
                {
                    "test_name": test.test_name,
                    "result_value": f"{raw_value}{f' {unit}' if unit and raw_value != 'Pending' else ''}",
                    "reference_range": (
                        result.reference_range_text
                        if result and result.reference_range_text
                        else (test.reference_range_text or "Not specified")
                    ),
                }
            )

        delivery = MailService.send_report_email(
            to_email=patient.email,
            patient_name=patient.full_name,
            visit_number=visit_number,
            report_number=report_number,
            approved_at_label=approved_at.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC"),
            doctor_note=doctor_note,
            analytes=analytes,
            pdf_bytes=ReportPdfService.build_report_pdf_bytes(
                report_number=report_number,
                visit_number=visit_number,
                patient_name=patient.full_name,
                patient_email=patient.email,
                generated_at=report.generated_at,
                doctor_note=doctor_note,
                analytes=analytes,
            ),
            pdf_filename=f"{report_number}.pdf",
        )
        if delivery.sent:
            delivered_at = datetime.now(UTC)
            report.delivered_at = delivered_at
            report.delivered_via = "email"
            report.report_status = ReportStatus.ISSUED
            report.updated_at = delivered_at
            db.commit()
        return delivery
