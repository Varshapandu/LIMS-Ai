from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.contracts import (
    DashboardAlertItem,
    DashboardCapacityResponse,
    DashboardCategoryItem,
    DashboardOverviewResponse,
    DashboardSnapshotResponse,
    DashboardTrendPoint,
)
from app.models.models import Department, Invoice, OrderTest, Patient, ResultRecord, ResultStatus, TestCatalog, Visit, VisitStatus


class DashboardService:
    @staticmethod
    def get_overview(db: Session) -> DashboardOverviewResponse:
        total_patients = db.query(func.count(Patient.id)).scalar() or 0
        revenue = db.query(func.coalesce(func.sum(Invoice.net_amount), 0)).scalar() or Decimal("0.00")
        pending_tests = db.query(func.count(OrderTest.id)).filter(OrderTest.result_status != ResultStatus.APPROVED).scalar() or 0
        completed_tests = db.query(func.count(OrderTest.id)).filter(OrderTest.result_status == ResultStatus.APPROVED).scalar() or 0
        critical_alerts = db.query(func.count(ResultRecord.id)).filter(ResultRecord.critical_flag.is_(True)).scalar() or 0
        today_visits = db.query(func.count(Visit.id)).filter(func.date(Visit.visit_date) == date.today()).scalar() or 0
        reported_visits = db.query(func.count(Visit.id)).filter(Visit.visit_status == VisitStatus.REPORTED).scalar() or 0

        return DashboardOverviewResponse(
            total_patients=total_patients,
            revenue=revenue,
            pending_tests=pending_tests,
            completed_tests=completed_tests,
            critical_alerts=critical_alerts,
            today_visits=today_visits,
            reported_visits=reported_visits,
        )

    @staticmethod
    def get_snapshot(db: Session) -> DashboardSnapshotResponse:
        overview = DashboardService.get_overview(db)
        daily_trends = DashboardService._daily_trends(db)
        category_distribution = DashboardService._category_distribution(db)
        capacity = DashboardService._capacity(overview)
        alerts = DashboardService._alerts(db)

        return DashboardSnapshotResponse(
            overview=overview,
            daily_trends=daily_trends,
            category_distribution=category_distribution,
            capacity=capacity,
            alerts=alerts,
        )

    @staticmethod
    def _daily_trends(db: Session) -> list[DashboardTrendPoint]:
        start_day = date.today() - timedelta(days=6)
        rows = (
            db.query(func.date(OrderTest.created_at), Department.code, func.count(OrderTest.id))
            .join(TestCatalog, OrderTest.test_id == TestCatalog.id)
            .join(Department, TestCatalog.department_id == Department.id)
            .filter(func.date(OrderTest.created_at) >= start_day)
            .group_by(func.date(OrderTest.created_at), Department.code)
            .all()
        )

        trend_map: dict[date, dict[str, int]] = defaultdict(lambda: {"HEM": 0, "BIO": 0, "MIC": 0})
        for row_day, department_code, count in rows:
            if isinstance(row_day, str):
                parsed_day = date.fromisoformat(row_day)
            else:
                parsed_day = row_day
            trend_map[parsed_day][department_code] = int(count)

        points: list[DashboardTrendPoint] = []
        for offset in range(7):
            current_day = start_day + timedelta(days=offset)
            bucket = trend_map[current_day]
            points.append(
                DashboardTrendPoint(
                    day_label=current_day.strftime("%a").upper(),
                    hematology=bucket.get("HEM", 0),
                    biochemistry=bucket.get("BIO", 0),
                    microbiology=bucket.get("MIC", 0),
                )
            )
        return points

    @staticmethod
    def _category_distribution(db: Session) -> list[DashboardCategoryItem]:
        rows = (
            db.query(Department.name, func.count(OrderTest.id))
            .join(TestCatalog, TestCatalog.department_id == Department.id)
            .join(OrderTest, OrderTest.test_id == TestCatalog.id)
            .group_by(Department.name)
            .order_by(func.count(OrderTest.id).desc())
            .all()
        )

        total = sum(int(count) for _, count in rows)
        if total == 0:
            return [
                DashboardCategoryItem(category="Biochemistry", count=0, percentage=Decimal("0.00")),
                DashboardCategoryItem(category="Hematology", count=0, percentage=Decimal("0.00")),
                DashboardCategoryItem(category="Microbiology", count=0, percentage=Decimal("0.00")),
            ]

        items: list[DashboardCategoryItem] = []
        for category, count in rows:
            percentage = (Decimal(int(count)) * Decimal("100.00") / Decimal(total)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            items.append(DashboardCategoryItem(category=category, count=int(count), percentage=percentage))
        return items

    @staticmethod
    def _capacity(overview: DashboardOverviewResponse) -> DashboardCapacityResponse:
        total_tests = overview.pending_tests + overview.completed_tests
        if total_tests == 0:
            return DashboardCapacityResponse(
                utilization_percent=Decimal("0.00"),
                remaining_percent=Decimal("100.00"),
                active_tests=0,
                completed_tests=0,
            )

        utilization = (Decimal(overview.pending_tests) * Decimal("100.00") / Decimal(total_tests)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        remaining = max(Decimal("0.00"), Decimal("100.00") - utilization)
        return DashboardCapacityResponse(
            utilization_percent=utilization,
            remaining_percent=remaining.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            active_tests=overview.pending_tests,
            completed_tests=overview.completed_tests,
        )

    @staticmethod
    def _alerts(db: Session) -> list[DashboardAlertItem]:
        rows = (
            db.query(ResultRecord, OrderTest, Visit, Patient, TestCatalog)
            .join(OrderTest, ResultRecord.order_test_id == OrderTest.id)
            .join(Visit, OrderTest.visit_id == Visit.id)
            .join(Patient, Visit.patient_id == Patient.id)
            .join(TestCatalog, OrderTest.test_id == TestCatalog.id)
            .filter(ResultRecord.critical_flag.is_(True))
            .order_by(ResultRecord.updated_at.desc())
            .limit(5)
            .all()
        )

        return [
            DashboardAlertItem(
                visit_number=visit.visit_number,
                patient_name=patient.full_name,
                test_name=test.test_name,
                severity="critical",
                message=f"Critical value recorded for {test.test_name}",
                triggered_at=result.updated_at,
            )
            for result, order_test, visit, patient, test in rows
        ]
