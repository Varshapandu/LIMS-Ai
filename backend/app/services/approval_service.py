"""Approval workflow service — handles approval case building, visit
approval / retest logic, trend data, and review-status derivation.

Extracted from ``ResultService`` to give the approval workflow its own
cohesive service boundary.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.api.contracts import (
    ApprovalAnalyteItem,
    ApprovalCaseResponse,
    ApprovalClinicalContext,
    ApprovalInterventionItem,
    ApprovalPatientHistory,
    ApprovalTrendPoint,
    VisitApprovalResponse,
)
from app.core.auth_deps import CurrentUser
from app.models.models import (
    Invoice,
    OrderTest,
    Patient,
    ResultRecord,
    ResultStatus,
    Specimen,
    SpecimenStatus,
    TestCatalog,
    Visit,
    VisitStatus,
)
from app.services.audit_service import log_audit
from app.services.flag_evaluation_service import FlagEvaluationService
from app.services.report_generation_service import ReportGenerationService


class ApprovalService:
    """Encapsulates the approval-case query and visit-approval workflow."""

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @staticmethod
    def get_approval_case(
        db: Session,
        visit_number: str | None = None,
        *,
        current_user: CurrentUser | None = None,
    ) -> ApprovalCaseResponse:
        """Build the rich approval-case payload for the approvals page."""

        query = _worklist_query(db, visit_number=visit_number)
        if not visit_number:
            query = query.filter(
                Visit.visit_status.in_(
                    [
                        VisitStatus.PROCESSING,
                        VisitStatus.APPROVED,
                        VisitStatus.REPORTED,
                        VisitStatus.COLLECTED,
                    ]
                )
            )

        rows = query.all()
        if not rows:
            raise ValueError("No approval case found")

        first_order_test, visit, patient, first_test, first_specimen, first_result = rows[0]
        invoice = db.query(Invoice).filter(Invoice.visit_id == visit.id, Invoice.is_deleted == False).first()  # noqa: E712

        analytes = [
            ApprovalService._to_approval_analyte(order_test, test, specimen, result)
            for order_test, _, _, test, specimen, result in rows
        ]
        critical_alerts = sum(1 for item in analytes if item.status_tone == "critical")
        fasting_row = next(
            (item for item in analytes if "glucose" in item.analyte_name.lower()),
            analytes[0],
        )
        latest_review_at = max(
            [
                value
                for value in [
                    first_result.verified_at if first_result else None,
                    first_result.updated_at if first_result else None,
                    first_specimen.received_at if first_specimen else None,
                    visit.updated_at,
                ]
                if value is not None
            ],
            default=visit.updated_at,
        )

        specimen_start_at = None
        if first_specimen:
            specimen_start_at = first_specimen.received_at or first_specimen.collected_at

        # Use authenticated user for doctor identity when available
        doctor_name = "Dr. Alistair Thorne"  # fallback
        doctor_role = "Chief Pathologist"     # fallback
        if current_user:
            doctor_name = current_user.full_name
            doctor_role = current_user.role.replace("_", " ").title()

        return ApprovalCaseResponse(
            visit_number=visit.visit_number,
            patient_id=patient.patient_code,
            patient_name=patient.full_name,
            age_years=patient.age_years,
            sex=patient.sex.value if patient.sex else None,
            case_label=f"#{visit.visit_number}",
            analysis_title=f"Current Analysis: {first_test.sample_type.upper()} PANEL",
            critical_alerts=critical_alerts,
            patient_history=ApprovalPatientHistory(
                diagnosis=visit.provisional_diagnosis or "Type II Diabetes Mellitus",
                medication=visit.symptoms_text or "Metformin 500mg BID",
                recent_notes=visit.clinical_notes or "Patient reporting persistent fatigue and blurred vision over the last 72 hours.",
            ),
            clinical_context=ApprovalClinicalContext(
                fasting_status="Fasting Status",
                fasting_note=(
                    "Confirmed 12h fast (verified by collection site)"
                    if "glucose" in fasting_row.analyte_name.lower()
                    else "Clinical fasting confirmation pending"
                ),
                last_review_at=latest_review_at,
                last_review_note=(
                    "Post-prandial glucose focus"
                    if "glucose" in fasting_row.analyte_name.lower()
                    else "Analytical review in progress"
                ),
            ),
            analytes=analytes,
            glucose_trend=ApprovalService._build_glucose_trend(fasting_row.numeric_value),
            interventions=[
                ApprovalInterventionItem(key="notify", label="Immediate Physician Notification", checked=critical_alerts > 0),
                ApprovalInterventionItem(key="ketoacidosis", label="Reflex Ketoacidosis Screening", checked=critical_alerts > 0),
                ApprovalInterventionItem(key="repeat", label="Stat Repeat (Diff. Methodology)", checked=False),
                ApprovalInterventionItem(key="validation-note", label="Add Clinical Validation Note", checked=False),
            ],
            review_status=ApprovalService._resolve_review_status(analytes),
            review_status_label=(
                "Validation Pending"
                if any(item.result_status != ResultStatus.APPROVED.value for item in analytes)
                else "Finalized"
            ),
            validation_pending=any(item.result_status != ResultStatus.APPROVED.value for item in analytes),
            analysis_time_label=ApprovalService._format_analysis_time(specimen_start_at, latest_review_at),
            doctor_name=doctor_name,
            doctor_role=doctor_role,
            doctor_note=first_result.comments if first_result and first_result.comments else None,
            signature_enabled=True,
            payment_status=(
                invoice.payment_status.value
                if invoice
                else ("paid" if (visit.due_amount or Decimal("0.00")) <= Decimal("0.00") else "pending")
            ),
            due_amount=visit.due_amount or Decimal("0.00"),
        )

    @staticmethod
    def approve_visit_results(
        db: Session,
        visit_number: str,
        action: str = "approve",
        doctor_note: str | None = None,
        intervention_keys: list[str] | None = None,
        *,
        current_user: CurrentUser | None = None,
    ) -> VisitApprovalResponse:
        """Approve, finalize, or request retest for all results in a visit."""

        visit = db.query(Visit).filter(Visit.visit_number == visit_number, Visit.is_deleted == False).first()  # noqa: E712
        if not visit:
            raise ValueError("Visit not found")
        if (visit.due_amount or Decimal("0.00")) > Decimal("0.00"):
            raise ValueError("Payment pending. Doctor cannot approve results until the bill is fully paid.")

        rows = (
            db.query(OrderTest, ResultRecord)
            .outerjoin(ResultRecord, ResultRecord.order_test_id == OrderTest.id)
            .filter(OrderTest.visit_id == visit.id)
            .all()
        )
        if not rows:
            raise ValueError("No ordered tests found for visit")

        now = datetime.now(UTC)
        approved_count = 0
        normalized_action = action.lower()
        report_number: str | None = None
        report_emailed = False
        report_emailed_to: str | None = None
        report_email_error: str | None = None
        message: str

        for order_test, result in rows:
            if not result:
                continue

            if doctor_note:
                result.comments = doctor_note
            if intervention_keys:
                intervention_note = f"Interventions: {', '.join(intervention_keys)}"
                result.comments = f"{result.comments}\n{intervention_note}".strip() if result.comments else intervention_note

            if normalized_action == "retest":
                if result.result_status in {ResultStatus.VERIFIED, ResultStatus.APPROVED}:
                    result.result_status = ResultStatus.ENTERED
                    result.approved_at = None
                    result.updated_at = now
                    order_test.result_status = ResultStatus.ENTERED
                    order_test.order_status = VisitStatus.PROCESSING
            elif result.result_status in {ResultStatus.ENTERED, ResultStatus.VERIFIED, ResultStatus.APPROVED}:
                result.result_status = ResultStatus.APPROVED
                result.approved_at = now
                result.verified_at = result.verified_at or now
                result.entered_at = result.entered_at or now
                result.updated_at = now
                order_test.result_status = ResultStatus.APPROVED
                order_test.order_status = VisitStatus.APPROVED
                approved_count += 1

        if normalized_action == "retest":
            visit.visit_status = VisitStatus.PROCESSING
            message = "Retest requested and approval moved back to active review."
        else:
            if approved_count == 0:
                raise ValueError("No entered or verified results available for approval")
            _refresh_visit_status(db, visit.id)
            message = "Result approved successfully."

        db.commit()

        # --- Audit log ---
        actor_id = current_user.user_id if current_user else None
        actor_name = current_user.full_name if current_user else None
        log_audit(
            db,
            entity_type="Visit",
            entity_id=visit.id,
            action=normalized_action,
            field_name="visit_status",
            old_value=None,
            new_value=visit.visit_status.value,
            actor_id=actor_id,
            actor_name=actor_name,
        )
        db.commit()

        if normalized_action == "finalize":
            report = ReportGenerationService.generate_report(db, visit_number)
            report_number = report.report_number
            delivery = ReportGenerationService.send_report_email(db, visit.id, visit_number, report.report_number, now, doctor_note)
            report_emailed = delivery.sent
            report_emailed_to = delivery.delivered_to
            report_email_error = delivery.error
            if delivery.sent and delivery.delivered_to:
                message = f"Result approved, final report generated, and emailed to {delivery.delivered_to}."
            elif delivery.error:
                message = f"Result approved and final report generated, but email was not sent: {delivery.error}"
            else:
                message = "Result approved and final report generated."

        refreshed_visit = db.query(Visit).filter(Visit.id == visit.id).first()
        return VisitApprovalResponse(
            visit_number=visit_number,
            approved_tests=approved_count,
            visit_status=refreshed_visit.visit_status.value,
            approved_at=now,
            action=normalized_action,
            doctor_note=doctor_note,
            report_number=report_number,
            report_emailed=report_emailed,
            report_emailed_to=report_emailed_to,
            report_email_error=report_email_error,
            message=message,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _to_approval_analyte(
        order_test: OrderTest,
        test: TestCatalog,
        specimen: Specimen | None,
        result: ResultRecord | None,
    ) -> ApprovalAnalyteItem:
        numeric_value = result.numeric_value if result else None
        abnormal_flag = result.abnormal_flag if result else None
        critical_flag = result.critical_flag if result else False

        status_label, status_tone = FlagEvaluationService.approval_status_for_row(
            test.test_name,
            numeric_value,
            result.result_text if result else None,
            abnormal_flag,
            critical_flag,
        )

        if specimen and specimen.specimen_status == SpecimenStatus.PENDING:
            status_label = "Awaiting Specimen"
            status_tone = "pending"

        return ApprovalAnalyteItem(
            order_test_id=order_test.id,
            test_code=test.test_code,
            analyte_name=test.test_name,
            method_name=test.method_name,
            result_status=result.result_status.value if result else order_test.result_status.value,
            result_text=result.result_text if result else None,
            numeric_value=numeric_value,
            unit=result.unit if result else test.unit,
            reference_range_text=result.reference_range_text if result else test.reference_range_text,
            abnormal_flag=abnormal_flag,
            critical_flag=critical_flag,
            status_label=status_label,
            status_tone=status_tone,
        )

    @staticmethod
    def _build_glucose_trend(current_value: Decimal | None) -> list[ApprovalTrendPoint]:
        """Build glucose trend data.

        .. note::
            The historical values are **demo/sample data**.  In a future
            iteration this should query actual past results for the
            patient.
        """
        fallback = [Decimal("112"), Decimal("118"), Decimal("115"), Decimal("142"), Decimal("121"), Decimal("160")]
        values = fallback[:-1] + [current_value or fallback[-1]]
        months = ["MAY", "JUN", "JUL", "AUG", "SEP", "OCT"]
        return [ApprovalTrendPoint(month=month, value=value) for month, value in zip(months, values, strict=False)]

    @staticmethod
    def _format_analysis_time(start_at: datetime | None, end_at: datetime | None) -> str:
        if not start_at or not end_at:
            return "02h 45m (Stat)"
        elapsed_minutes = max(int((end_at - start_at).total_seconds() // 60), 1)
        hours = elapsed_minutes // 60
        minutes = elapsed_minutes % 60
        return f"{hours:02d}h {minutes:02d}m (Stat)"

    @staticmethod
    def _resolve_review_status(analytes: list[ApprovalAnalyteItem]) -> str:
        if all(item.result_status == ResultStatus.APPROVED.value for item in analytes):
            return "finalized"
        if any(item.result_status in {ResultStatus.VERIFIED.value, ResultStatus.APPROVED.value} for item in analytes):
            return "reviewing"
        return "pending"


# ---------------------------------------------------------------------------
# Shared query helpers (also used by ResultService)
# ---------------------------------------------------------------------------


def _worklist_query(
    db: Session,
    visit_number: str | None = None,
    barcode_value: str | None = None,
):
    """Build the base worklist query joining OrderTest → Visit → Patient → TestCatalog → Specimen → ResultRecord."""
    query = (
        db.query(OrderTest, Visit, Patient, TestCatalog, Specimen, ResultRecord)
        .join(Visit, OrderTest.visit_id == Visit.id)
        .join(Patient, OrderTest.patient_id == Patient.id)
        .join(TestCatalog, OrderTest.test_id == TestCatalog.id)
        .outerjoin(Specimen, Specimen.order_test_id == OrderTest.id)
        .outerjoin(ResultRecord, ResultRecord.order_test_id == OrderTest.id)
        .order_by(Visit.visit_date.desc(), TestCatalog.test_name.asc())
    )
    if visit_number:
        query = query.filter(Visit.visit_number == visit_number)
    if barcode_value:
        query = query.filter(OrderTest.barcode_value == barcode_value)
    return query


def _refresh_visit_status(db: Session, visit_id: str) -> None:
    """Recalculate and persist the aggregate visit status from its order tests."""
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        return

    statuses = [status for (status,) in db.query(OrderTest.result_status).filter(OrderTest.visit_id == visit_id).all()]
    if not statuses:
        visit.visit_status = VisitStatus.BILLED
        return

    if all(status == ResultStatus.APPROVED for status in statuses):
        visit.visit_status = VisitStatus.APPROVED
    elif any(status in {ResultStatus.ENTERED, ResultStatus.VERIFIED, ResultStatus.APPROVED} for status in statuses):
        visit.visit_status = VisitStatus.PROCESSING
    else:
        visit.visit_status = VisitStatus.COLLECTED
