from __future__ import annotations

from decimal import Decimal

from sqlalchemy import case
from sqlalchemy.orm import Session

from app.api.contracts import CatalogTestItem
from app.models.models import Department, TestCatalog


class CatalogService:
    @staticmethod
    def list_tests(db: Session, query: str | None = None, limit: int = 20) -> list[CatalogTestItem]:
        statement = (
            db.query(TestCatalog, Department)
            .join(Department, TestCatalog.department_id == Department.id)
            .filter(TestCatalog.is_active.is_(True))
        )

        if query:
            normalized = query.strip()
            prefix = f"{normalized}%"
            contains = f"%{normalized}%"
            priority = case(
                (TestCatalog.test_code.ilike(prefix), 0),
                (TestCatalog.test_name.ilike(prefix), 1),
                (TestCatalog.short_name.ilike(prefix), 2),
                else_=3,
            )
            statement = (
                statement.filter(
                    TestCatalog.test_code.ilike(contains)
                    | TestCatalog.test_name.ilike(contains)
                    | TestCatalog.short_name.ilike(contains)
                )
                .order_by(priority, TestCatalog.test_name.asc())
            )
        else:
            statement = statement.order_by(TestCatalog.test_name.asc())

        rows = statement.limit(max(1, min(limit, 50))).all()
        return [
            CatalogTestItem(
                id=test.id,
                test_code=test.test_code,
                test_name=test.test_name,
                service_category=test.service_category.value,
                sample_type=test.sample_type,
                container_type=test.container_type,
                department_name=department.name,
                price=test.price or Decimal("0.00"),
                turnaround_minutes=test.turnaround_minutes,
                unit=test.unit,
                reference_range_text=test.reference_range_text,
            )
            for test, department in rows
        ]
