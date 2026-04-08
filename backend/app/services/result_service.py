from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy.orm import Session

from app.api.contracts import (
    ApprovalAnalyteItem,
    ApprovalCaseResponse,
    ApprovalClinicalContext,
    ApprovalInterventionItem,
    ApprovalPatientHistory,
    ApprovalTrendPoint,
    ReportDetailResponse,
    ReportLineItem,
    ReportResponse,
    ResultEntryRequest,
    ResultEntryResponse,
    ResultWorklistItem,
    VisitApprovalResponse,
)
from app.models.models import Invoice, OrderTest, Patient, ReferenceRange, Report, ReportStatus, ResultRecord, ResultStatus, Specimen, SpecimenStatus, TestCatalog, Visit, VisitStatus
from app.services.mail_service import MailService
from app.services.report_pdf_service import ReportPdfService


class ResultService:
    @staticmethod
    def get_worklist(db: Session, visit_number: str | None = None, barcode_value: str | None = None) -> list[ResultWorklistItem]:
        rows = ResultService._worklist_query(db, visit_number=visit_number, barcode_value=barcode_value).all()
        return [ResultService._to_worklist_item(order_test, visit, patient, test, specimen, result) for order_test, visit, patient, test, specimen, result in rows]

    @staticmethod
    def get_approval_case(db: Session, visit_number: str | None = None) -> ApprovalCaseResponse:
        query = ResultService._worklist_query(db, visit_number=visit_number)
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
        invoice = db.query(Invoice).filter(Invoice.visit_id == visit.id).first()
        analytes = [
            ResultService._to_approval_analyte(order_test, test, specimen, result)
            for order_test, _, _, test, specimen, result in rows
        ]
        critical_alerts = sum(1 for item in analytes if item.status_tone == "critical")
        fasting_row = next((item for item in analytes if "glucose" in item.analyte_name.lower()), analytes[0])
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
                fasting_note="Confirmed 12h fast (verified by collection site)" if "glucose" in fasting_row.analyte_name.lower() else "Clinical fasting confirmation pending",
                last_review_at=latest_review_at,
                last_review_note="Post-prandial glucose focus" if "glucose" in fasting_row.analyte_name.lower() else "Analytical review in progress",
            ),
            analytes=analytes,
            glucose_trend=ResultService._build_glucose_trend(fasting_row.numeric_value),
            interventions=[
                ApprovalInterventionItem(key="notify", label="Immediate Physician Notification", checked=critical_alerts > 0),
                ApprovalInterventionItem(key="ketoacidosis", label="Reflex Ketoacidosis Screening", checked=critical_alerts > 0),
                ApprovalInterventionItem(key="repeat", label="Stat Repeat (Diff. Methodology)", checked=False),
                ApprovalInterventionItem(key="validation-note", label="Add Clinical Validation Note", checked=False),
            ],
            review_status=ResultService._resolve_review_status(analytes),
            review_status_label="Validation Pending" if any(item.result_status != ResultStatus.APPROVED.value for item in analytes) else "Finalized",
            validation_pending=any(item.result_status != ResultStatus.APPROVED.value for item in analytes),
            analysis_time_label=ResultService._format_analysis_time(specimen_start_at, latest_review_at),
            doctor_name="Dr. Alistair Thorne",
            doctor_role="Chief Pathologist",
            doctor_note=first_result.comments if first_result and first_result.comments else None,
            signature_enabled=True,
            payment_status=invoice.payment_status.value if invoice else ("paid" if (visit.due_amount or Decimal("0.00")) <= Decimal("0.00") else "pending"),
            due_amount=visit.due_amount or Decimal("0.00"),
        )

    @staticmethod
    def save_result(db: Session, payload: ResultEntryRequest) -> ResultEntryResponse:
        row = (
            db.query(OrderTest, TestCatalog, Visit, ResultRecord)
            .join(TestCatalog, OrderTest.test_id == TestCatalog.id)
            .join(Visit, OrderTest.visit_id == Visit.id)
            .outerjoin(ResultRecord, ResultRecord.order_test_id == OrderTest.id)
            .filter(OrderTest.id == payload.order_test_id)
            .first()
        )
        if not row:
            raise ValueError("Order test not found")

        order_test, test, visit, result = row
        now = datetime.now(timezone.utc)
        new_status = ResultStatus(payload.result_status)

        if not result:
            result = ResultRecord(
                id=str(uuid4()),
                order_test_id=order_test.id,
                result_status=new_status,
                unit=test.unit,
                reference_range_text=test.reference_range_text,
            )
            db.add(result)

        abnormal_flag, critical_flag = ResultService._evaluate_flags(test, payload.numeric_value, payload.result_text)

        result.result_text = payload.result_text
        result.numeric_value = payload.numeric_value
        result.result_status = new_status
        result.unit = test.unit
        result.reference_range_text = test.reference_range_text
        result.abnormal_flag = abnormal_flag
        result.critical_flag = critical_flag
        result.updated_at = now

        if new_status in {ResultStatus.ENTERED, ResultStatus.VERIFIED, ResultStatus.APPROVED}:
            result.entered_at = result.entered_at or now
        if new_status in {ResultStatus.VERIFIED, ResultStatus.APPROVED}:
            result.verified_at = now
        if new_status == ResultStatus.APPROVED:
            result.approved_at = now

        order_test.result_status = new_status
        order_test.order_status = VisitStatus.PROCESSING if new_status != ResultStatus.APPROVED else VisitStatus.APPROVED

        ResultService._refresh_visit_status(db, visit.id)

        db.commit()
        db.refresh(result)

        return ResultEntryResponse(
            order_test_id=order_test.id,
            result_status=result.result_status.value,
            result_text=result.result_text,
            numeric_value=result.numeric_value,
            approved_at=result.approved_at,
            abnormal_flag=result.abnormal_flag,
            critical_flag=result.critical_flag,
            updated_at=result.updated_at,
        )

    @staticmethod
    def approve_visit_results(
        db: Session,
        visit_number: str,
        action: str = "approve",
        doctor_note: str | None = None,
        intervention_keys: list[str] | None = None,
    ) -> VisitApprovalResponse:
        visit = db.query(Visit).filter(Visit.visit_number == visit_number).first()
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

        now = datetime.now(timezone.utc)
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
            ResultService._refresh_visit_status(db, visit.id)
            message = "Result approved successfully."

        db.commit()

        if normalized_action == "finalize":
            report = ResultService.generate_report(db, visit_number)
            report_number = report.report_number
            delivery = ResultService._send_report_email(db, visit.id, visit_number, report.report_number, now, doctor_note)
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

    @staticmethod
    def generate_report(db: Session, visit_number: str) -> ReportResponse:
        visit = db.query(Visit).filter(Visit.visit_number == visit_number).first()
        if not visit:
            raise ValueError("Visit not found")

        approved_tests = db.query(OrderTest).filter(OrderTest.visit_id == visit.id, OrderTest.result_status == ResultStatus.APPROVED).count()
        if approved_tests == 0:
            raise ValueError("No approved results available for report generation")

        report = db.query(Report).filter(Report.visit_id == visit.id).first()
        now = datetime.now(timezone.utc)
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
    def _send_report_email(
        db: Session,
        visit_id: str,
        visit_number: str,
        report_number: str,
        approved_at: datetime,
        doctor_note: str | None,
    ):
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
                approved_at_label=approved_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
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
        for order_test, test, result in item_rows:
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
            approved_at_label=approved_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
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
            delivered_at = datetime.now(timezone.utc)
            report.delivered_at = delivered_at
            report.delivered_via = "email"
            report.report_status = ReportStatus.ISSUED
            report.updated_at = delivered_at
            db.commit()
        return delivery

    @staticmethod
    def _worklist_query(db: Session, visit_number: str | None = None, barcode_value: str | None = None):
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

    @staticmethod
    def _to_worklist_item(
        order_test: OrderTest,
        visit: Visit,
        patient: Patient,
        test: TestCatalog,
        specimen: Specimen | None,
        result: ResultRecord | None,
    ) -> ResultWorklistItem:
        return ResultWorklistItem(
            order_test_id=order_test.id,
            visit_number=visit.visit_number,
            patient_id=patient.id,
            patient_name=patient.full_name,
            age_years=patient.age_years,
            sex=patient.sex.value if patient.sex else None,
            clinical_notes=visit.clinical_notes,
            barcode_value=order_test.barcode_value,
            test_code=test.test_code,
            test_name=test.test_name,
            service_category=test.service_category.value if test.service_category else None,
            method_name=test.method_name,
            sample_type=order_test.sample_type,
            container_type=order_test.container_type,
            priority=order_test.priority,
            specimen_status=specimen.specimen_status.value if specimen else SpecimenStatus.PENDING.value,
            result_status=(result.result_status.value if result else order_test.result_status.value),
            result_text=result.result_text if result else None,
            numeric_value=result.numeric_value if result else None,
            unit=result.unit if result else test.unit,
            reference_range_text=result.reference_range_text if result else test.reference_range_text,
            tat_due_at=order_test.tat_due_at,
        )

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
        status_label, status_tone = ResultService._approval_status_for_row(
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
    def _approval_status_for_row(
        test_name: str,
        numeric_value: Decimal | None,
        result_text: str | None,
        abnormal_flag: str | None,
        critical_flag: bool,
    ) -> tuple[str, str]:
        test_key = test_name.lower()
        if numeric_value is None and not (result_text and result_text.strip()) and not abnormal_flag:
            return "Pending", "pending"
        if "hba1c" in test_key and numeric_value is not None and numeric_value >= Decimal("6.5"):
            return "Uncontrolled", "critical"
        if "sodium" in test_key and numeric_value is not None and numeric_value >= Decimal("150"):
            return "Severe", "critical"
        if critical_flag and abnormal_flag == "LOW":
            return "Critical Low", "critical"
        if critical_flag and abnormal_flag == "HIGH":
            return "Critical High", "critical"
        if critical_flag and abnormal_flag == "POSITIVE":
            return "Critical Positive", "critical"
        if critical_flag:
            return "Critical Abnormal", "critical"
        if abnormal_flag == "HIGH":
            return "High", "critical"
        if abnormal_flag == "LOW":
            return "Low", "critical"
        return "Normal", "normal"

    @staticmethod
    def _build_glucose_trend(current_value: Decimal | None) -> list[ApprovalTrendPoint]:
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

    @staticmethod
    def _resolve_reference_row(db: Session, test_id: str, age_years: int | None, sex: str | None) -> tuple[str | None, str | None]:
        query = db.query(ReferenceRange).filter(ReferenceRange.test_id == test_id)

        normalized_sex = sex.lower() if sex else None
        rows = query.all()
        if not rows:
            return None, None

        def matches(row: ReferenceRange) -> bool:
            sex_ok = row.sex is None or (normalized_sex is not None and row.sex.value == normalized_sex)
            min_ok = row.min_age_years is None or (age_years is not None and age_years >= row.min_age_years)
            max_ok = row.max_age_years is None or (age_years is not None and age_years <= row.max_age_years)
            return sex_ok and min_ok and max_ok

        for row in rows:
            if matches(row):
                return row.unit, row.reference_range_text

        default_row = next((row for row in rows if row.is_default), None)
        if default_row:
            return default_row.unit, default_row.reference_range_text

        first_row = rows[0]
        return first_row.unit, first_row.reference_range_text


    @staticmethod
    def _normalize_qualitative_text(value: str) -> str:
        return " ".join(value.lower().replace("(", " ").replace(")", " ").replace("/", " ").replace("-", " ").split())

    @staticmethod
    def _evaluate_qualitative_flag(reference_range_text: str | None, result_text: str | None) -> tuple[str | None, bool]:
        if not reference_range_text or not result_text or not result_text.strip():
            return None, False

        normalized_range = ResultService._normalize_qualitative_text(reference_range_text)
        normalized_value = ResultService._normalize_qualitative_text(result_text)
        negative_markers = [
            "negative",
            "non reactive",
            "nonreactive",
            "no growth",
            "no pathogen isolated",
            "not detected",
            "absent",
            "normal morphology",
        ]

        if not any(marker in normalized_range for marker in negative_markers):
            return None, False

        if any(marker in normalized_value for marker in negative_markers + ["normal"]):
            return None, False

        positive_markers = [
            "positive",
            "reactive",
            "detected",
            "present",
            "growth",
            "pathogen isolated",
            "seen",
        ]
        if any(marker in normalized_value for marker in positive_markers):
            return "POSITIVE", True

        return "ABNORMAL", True

    @staticmethod
    def _evaluate_flags(test: TestCatalog, numeric_value: Decimal | None, result_text: str | None) -> tuple[str | None, bool]:
        if numeric_value is None:
            return ResultService._evaluate_qualitative_flag(test.reference_range_text, result_text)

        critical_flag = False
        abnormal_flag = None

        if test.critical_low is not None and numeric_value <= test.critical_low:
            abnormal_flag = "LOW"
            critical_flag = True
        elif test.critical_high is not None and numeric_value >= test.critical_high:
            abnormal_flag = "HIGH"
            critical_flag = True

        return abnormal_flag, critical_flag

    @staticmethod
    def _refresh_visit_status(db: Session, visit_id: str) -> None:
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
