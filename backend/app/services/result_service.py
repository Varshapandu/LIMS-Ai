"""Result entry service — handles the result worklist and saving individual
test results.

This is the slimmed-down core of the original monolithic ``ResultService``.
Approval, reporting, and flag-evaluation logic have been extracted into
dedicated services:

* :mod:`app.services.flag_evaluation_service`
* :mod:`app.services.approval_service`
* :mod:`app.services.report_generation_service`
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy.orm import Session

from app.api.contracts import (
    ResultEntryRequest,
    ResultEntryResponse,
    ResultWorklistItem,
)
from app.models.models import (
    OrderTest,
    Patient,
    ReferenceRange,
    ResultRecord,
    ResultStatus,
    Specimen,
    SpecimenStatus,
    TestCatalog,
    Visit,
    VisitStatus,
)
from app.services.approval_service import _refresh_visit_status, _worklist_query
from app.services.flag_evaluation_service import FlagEvaluationService


class ResultService:
    """Lean result-entry service focused on worklist queries and saving results."""

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @staticmethod
    def get_worklist(
        db: Session,
        visit_number: str | None = None,
        barcode_value: str | None = None,
    ) -> list[ResultWorklistItem]:
        rows = _worklist_query(db, visit_number=visit_number, barcode_value=barcode_value).all()
        return [
            ResultService._to_worklist_item(order_test, visit, patient, test, specimen, result)
            for order_test, visit, patient, test, specimen, result in rows
        ]

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

        abnormal_flag, critical_flag = FlagEvaluationService.evaluate_flags(test, payload.numeric_value, payload.result_text)

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

        _refresh_visit_status(db, visit.id)

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

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

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
    def _resolve_reference_row(
        db: Session,
        test_id: str,
        age_years: int | None,
        sex: str | None,
    ) -> tuple[str | None, str | None]:
        """Resolve the best-matching reference range for a test and patient demographics."""

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
