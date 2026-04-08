from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.contracts import SearchWorklistItem
from app.models.models import Department, Invoice, OrderHeader, OrderTest, Patient, Report, ResultRecord, Specimen, TestCatalog, Visit


class SearchService:
    @staticmethod
    def search_worklist(
        db: Session,
        search: str | None = None,
        patient_name: str | None = None,
        visit_number: str | None = None,
        barcode_value: str | None = None,
        test_name: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int = 100,
    ) -> list[SearchWorklistItem]:
        query_stmt = (
            db.query(OrderTest, Visit, Patient, TestCatalog, Department, Specimen, ResultRecord, Report, Invoice, OrderHeader)
            .join(Visit, OrderTest.visit_id == Visit.id)
            .join(Patient, OrderTest.patient_id == Patient.id)
            .join(TestCatalog, OrderTest.test_id == TestCatalog.id)
            .join(Department, TestCatalog.department_id == Department.id)
            .join(OrderHeader, OrderTest.order_id == OrderHeader.id)
            .outerjoin(Specimen, Specimen.order_test_id == OrderTest.id)
            .outerjoin(ResultRecord, ResultRecord.order_test_id == OrderTest.id)
            .outerjoin(Report, Report.visit_id == Visit.id)
            .outerjoin(Invoice, Invoice.visit_id == Visit.id)
            .order_by(Visit.visit_date.desc(), Patient.full_name.asc())
        )

        if search:
            like_value = f"%{search.strip()}%"
            query_stmt = query_stmt.filter(
                or_(
                    Patient.full_name.ilike(like_value),
                    Patient.patient_code.ilike(like_value),
                    Visit.visit_number.ilike(like_value),
                    OrderTest.barcode_value.ilike(like_value),
                    TestCatalog.test_name.ilike(like_value),
                    TestCatalog.test_code.ilike(like_value),
                )
            )

        if patient_name:
            query_stmt = query_stmt.filter(Patient.full_name.ilike(f"%{patient_name.strip()}%"))
        if visit_number:
            query_stmt = query_stmt.filter(Visit.visit_number.ilike(f"%{visit_number.strip()}%"))
        if barcode_value:
            query_stmt = query_stmt.filter(OrderTest.barcode_value.ilike(f"%{barcode_value.strip()}%"))
        if test_name:
            query_stmt = query_stmt.filter(TestCatalog.test_name.ilike(f"%{test_name.strip()}%"))
        if date_from:
            query_stmt = query_stmt.filter(func.date(Visit.visit_date) >= date_from)
        if date_to:
            query_stmt = query_stmt.filter(func.date(Visit.visit_date) <= date_to)

        rows = query_stmt.limit(max(1, min(limit, 200))).all()

        return [
            SearchWorklistItem(
                patient_id=patient.id,
                patient_code=patient.patient_code,
                patient_name=patient.full_name,
                visit_id=visit.id,
                visit_number=visit.visit_number,
                visit_date=visit.visit_date,
                invoice_number=invoice.invoice_number if invoice else None,
                order_number=order.order_number if order else None,
                barcode_value=order_test.barcode_value,
                test_code=test.test_code,
                test_name=test.test_name,
                department_name=department.name,
                sample_type=order_test.sample_type,
                container_type=order_test.container_type,
                specimen_status=specimen.specimen_status.value if specimen else "pending",
                result_status=(result.result_status.value if result else order_test.result_status.value),
                report_status=report.report_status.value if report else None,
                tat_due_at=order_test.tat_due_at,
                net_amount=invoice.net_amount if invoice else Decimal("0.00"),
            )
            for order_test, visit, patient, test, department, specimen, result, report, invoice, order in rows
        ]
