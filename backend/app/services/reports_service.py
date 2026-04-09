from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.api.contracts import (
    ReportsAnalyticsResponse,
    ReportsBottleneckItem,
    ReportsDepartmentPerformanceItem,
    ReportsDistributionItem,
    ReportsFilterOption,
    ReportsHighVolumeTestItem,
    ReportsMetricCard,
    ReportsRecentReportItem,
)
from app.models.models import (
    Department,
    OrderTest,
    Patient,
    Report,
    ReportStatus,
    ResultRecord,
    ResultStatus,
    ServiceCategory,
    Specimen,
    SpecimenStatus,
    TestCatalog,
    Visit,
)


def _to_decimal(value: Decimal | int | float | None, precision: str = "0.01") -> Decimal:
    if value is None:
        return Decimal("0.00")
    if isinstance(value, Decimal):
        decimal_value = value
    else:
        decimal_value = Decimal(str(value))
    return decimal_value.quantize(Decimal(precision), rounding=ROUND_HALF_UP)


def _percent(numerator: int | Decimal, denominator: int | Decimal) -> Decimal:
    if not denominator:
        return Decimal("0.00")
    return _to_decimal((Decimal(str(numerator)) * Decimal("100")) / Decimal(str(denominator)))


def _normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.replace(tzinfo=None)
    return value


def _safe_hours(start: datetime | None, end: datetime | None) -> Decimal | None:
    start = _normalize_datetime(start)
    end = _normalize_datetime(end)
    if start is None or end is None or end <= start:
        return None
    return _to_decimal((end - start).total_seconds() / 3600, "0.01")


def _age_bucket(age_years: int | None) -> str:
    if age_years is None:
        return "Unknown"
    if age_years < 18:
        return "0-17"
    if age_years < 31:
        return "18-30"
    if age_years < 46:
        return "31-45"
    if age_years < 61:
        return "46-60"
    return "60+"


def _tone_from_ratio(ratio: Decimal) -> tuple[str, str]:
    if ratio >= Decimal("22.00"):
        return "Critical Delay", "critical"
    if ratio >= Decimal("10.00"):
        return "Warning", "warning"
    return "Normal", "normal"


@dataclass
class AnalyticsRow:
    order_test: OrderTest
    test: TestCatalog
    department: Department
    patient: Patient
    visit: Visit
    specimen: Specimen | None
    result: ResultRecord | None
    report: Report | None


class ReportsService:
    @staticmethod
    def get_analytics(
        db: Session,
        date_range_days: int = 30,
        department: str | None = None,
        test_type: str | None = None,
    ) -> ReportsAnalyticsResponse:
        selected_department = (department or "all").lower()
        selected_test_type = (test_type or "all").lower()

        available_departments = [
            ReportsFilterOption(label="All Departments", value="all"),
            *[
                ReportsFilterOption(label=item.name, value=item.code.lower())
                for item in db.query(Department).filter(Department.is_active.is_(True)).order_by(Department.display_order.asc()).all()
            ],
        ]
        available_test_types = [
            ReportsFilterOption(label="All Test Types", value="all"),
            *[
                ReportsFilterOption(label=item.value.title(), value=item.value)
                for item in ServiceCategory
            ],
        ]

        valid_departments = {item.value for item in available_departments}
        valid_test_types = {item.value for item in available_test_types}
        if selected_department not in valid_departments:
            raise ValueError(f"Unknown department filter: {department}")
        if selected_test_type not in valid_test_types:
            raise ValueError(f"Unknown test type filter: {test_type}")

        today = datetime.now()
        start_dt = today - timedelta(days=date_range_days - 1)
        previous_start = start_dt - timedelta(days=date_range_days)
        previous_end = start_dt

        current_rows = ReportsService._fetch_rows(
            db,
            start_dt=start_dt,
            end_dt=today,
            department=selected_department,
            test_type=selected_test_type,
        )
        previous_rows = ReportsService._fetch_rows(
            db,
            start_dt=previous_start,
            end_dt=previous_end,
            department=selected_department,
            test_type=selected_test_type,
        )

        metric_cards = ReportsService._build_metric_cards(current_rows, previous_rows, today)
        department_performance = ReportsService._build_department_performance(current_rows, previous_rows)
        bottlenecks = ReportsService._build_bottlenecks(current_rows)
        gender_distribution = ReportsService._build_distribution(
            current_rows,
            lambda row: (row.patient.sex.value.title() if getattr(row.patient.sex, "value", None) else "Unknown"),
            ["Male", "Female", "Other", "Unknown"],
        )
        age_distribution = ReportsService._build_distribution(
            current_rows,
            lambda row: _age_bucket(row.patient.age_years),
            ["0-17", "18-30", "31-45", "46-60", "60+", "Unknown"],
        )
        priority_distribution = ReportsService._build_distribution(
            current_rows,
            lambda row: row.order_test.priority.title(),
            ["Normal", "Stat"],
        )
        top_tests = ReportsService._build_top_tests(current_rows)
        recent_reports = ReportsService._build_recent_reports(current_rows)
        strategic_notes = ReportsService._build_notes(metric_cards, bottlenecks, top_tests, gender_distribution)

        return ReportsAnalyticsResponse(
            generated_at=today,
            date_range_days=date_range_days,
            selected_department=selected_department,
            selected_test_type=selected_test_type,
            available_departments=available_departments,
            available_test_types=available_test_types,
            metric_cards=metric_cards,
            department_performance=department_performance,
            bottlenecks=bottlenecks,
            gender_distribution=gender_distribution,
            age_distribution=age_distribution,
            priority_distribution=priority_distribution,
            top_tests=top_tests,
            recent_reports=recent_reports,
            strategic_notes=strategic_notes,
        )

    @staticmethod
    def _fetch_rows(
        db: Session,
        start_dt: datetime,
        end_dt: datetime,
        department: str,
        test_type: str,
    ) -> list[AnalyticsRow]:
        query = (
            db.query(OrderTest, TestCatalog, Department, Patient, Visit, Specimen, ResultRecord, Report)
            .join(TestCatalog, OrderTest.test_id == TestCatalog.id)
            .join(Department, TestCatalog.department_id == Department.id)
            .join(Patient, OrderTest.patient_id == Patient.id)
            .join(Visit, OrderTest.visit_id == Visit.id)
            .outerjoin(Specimen, Specimen.order_test_id == OrderTest.id)
            .outerjoin(ResultRecord, ResultRecord.order_test_id == OrderTest.id)
            .outerjoin(Report, Report.visit_id == Visit.id)
            .filter(OrderTest.created_at >= start_dt, OrderTest.created_at <= end_dt)
        )

        if department != "all":
            query = query.filter(Department.code == department.upper())
        if test_type != "all":
            query = query.filter(TestCatalog.service_category == ServiceCategory(test_type))

        return [
            AnalyticsRow(
                order_test=order_test,
                test=test,
                department=dept,
                patient=patient,
                visit=visit,
                specimen=specimen,
                result=result,
                report=report,
            )
            for order_test, test, dept, patient, visit, specimen, result, report in query.all()
        ]

    @staticmethod
    def _build_metric_cards(current_rows: list[AnalyticsRow], previous_rows: list[AnalyticsRow], today: datetime) -> list[ReportsMetricCard]:
        month_start = datetime(today.year, today.month, 1)

        current_samples = len(current_rows)
        previous_samples = len(previous_rows)
        current_completed = sum(1 for row in current_rows if row.order_test.result_status == ResultStatus.APPROVED)
        _previous_completed = sum(1 for row in previous_rows if row.order_test.result_status == ResultStatus.APPROVED)  # noqa: F841

        current_tat_values = [value for value in (ReportsService._row_tat_hours(row) for row in current_rows) if value is not None]
        previous_tat_values = [value for value in (ReportsService._row_tat_hours(row) for row in previous_rows) if value is not None]
        current_tat = _to_decimal(sum(current_tat_values, Decimal("0.00")) / len(current_tat_values), "0.01") if current_tat_values else Decimal("0.00")
        previous_tat = _to_decimal(sum(previous_tat_values, Decimal("0.00")) / len(previous_tat_values), "0.01") if previous_tat_values else Decimal("0.00")

        current_mtd_revenue = sum(
            row.test.price
            for row in current_rows
            if _normalize_datetime(row.order_test.created_at) and _normalize_datetime(row.order_test.created_at) >= month_start
        )
        previous_mtd_revenue = sum(
            row.test.price
            for row in previous_rows
            if _normalize_datetime(row.order_test.created_at) and _normalize_datetime(row.order_test.created_at) >= (month_start - timedelta(days=month_start.day))
        )

        current_reruns = sum(
            1
            for row in current_rows
            if (row.specimen and row.specimen.specimen_status == SpecimenStatus.REJECTED)
            or row.order_test.result_status == ResultStatus.AMENDED
        )
        previous_reruns = sum(
            1
            for row in previous_rows
            if (row.specimen and row.specimen.specimen_status == SpecimenStatus.REJECTED)
            or row.order_test.result_status == ResultStatus.AMENDED
        )

        return [
            ReportsMetricCard(
                label="Samples Processed",
                value=current_samples,
                change_percent=_percent(current_samples - previous_samples, previous_samples or 1),
                change_direction="up" if current_samples >= previous_samples else "down",
                footnote=f"{current_completed} approved in range",
                accent="teal",
            ),
            ReportsMetricCard(
                label="Average TAT",
                value=current_tat,
                change_percent=_percent(current_tat - previous_tat, previous_tat or Decimal("1.00")) if previous_tat else Decimal("0.00"),
                change_direction="down" if previous_tat and current_tat <= previous_tat else "up",
                footnote="Hours from collection to validation",
                accent="navy",
            ),
            ReportsMetricCard(
                label="Revenue MTD",
                value=_to_decimal(current_mtd_revenue),
                change_percent=_percent(_to_decimal(current_mtd_revenue) - _to_decimal(previous_mtd_revenue), _to_decimal(previous_mtd_revenue) or Decimal("1.00"))
                if previous_mtd_revenue
                else Decimal("0.00"),
                change_direction="up" if current_mtd_revenue >= previous_mtd_revenue else "down",
                footnote=f"{sum(1 for row in current_rows if _normalize_datetime(row.order_test.created_at) and _normalize_datetime(row.order_test.created_at) >= month_start)} tests billed this month",
                accent="teal",
            ),
            ReportsMetricCard(
                label="Rerun Rate",
                value=_to_decimal(_percent(current_reruns, current_samples or 1)),
                change_percent=_percent(current_reruns - previous_reruns, previous_reruns or 1),
                change_direction="down" if current_reruns <= previous_reruns else "up",
                footnote=f"{current_reruns} reruns or rejected samples",
                accent="red",
            ),
        ]

    @staticmethod
    def _build_department_performance(current_rows: list[AnalyticsRow], previous_rows: list[AnalyticsRow]) -> list[ReportsDepartmentPerformanceItem]:
        current_map: dict[str, dict[str, Decimal | int | str]] = defaultdict(lambda: {"name": "", "revenue": Decimal("0.00"), "count": 0})
        previous_map: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))

        for row in current_rows:
            bucket = current_map[row.department.code]
            bucket["name"] = row.department.name
            bucket["revenue"] = Decimal(bucket["revenue"]) + row.test.price
            bucket["count"] = int(bucket["count"]) + 1

        for row in previous_rows:
            previous_map[row.department.code] += row.test.price

        items: list[ReportsDepartmentPerformanceItem] = []
        for code, bucket in current_map.items():
            actual = _to_decimal(bucket["revenue"])
            previous_value = _to_decimal(previous_map[code])
            target = _to_decimal(previous_value * Decimal("1.08")) if previous_value else _to_decimal(actual * Decimal("1.12"))
            growth = _percent(actual - previous_value, previous_value or Decimal("1.00")) if previous_value else Decimal("0.00")
            items.append(
                ReportsDepartmentPerformanceItem(
                    department_code=code,
                    department_name=str(bucket["name"]),
                    actual_revenue=actual,
                    target_revenue=target,
                    growth_percent=growth,
                    sample_count=int(bucket["count"]),
                )
            )

        return sorted(items, key=lambda item: item.actual_revenue, reverse=True)

    @staticmethod
    def _build_bottlenecks(rows: list[AnalyticsRow]) -> list[ReportsBottleneckItem]:
        total = len(rows) or 1
        stage_counts = {
            "Accessioning": sum(
                1 for row in rows if row.specimen is None or row.specimen.specimen_status in {SpecimenStatus.PENDING, SpecimenStatus.COLLECTED}
            ),
            "Analytical Run": sum(
                1
                for row in rows
                if row.specimen
                and row.specimen.specimen_status in {SpecimenStatus.RECEIVED, SpecimenStatus.PROCESSING}
                and row.order_test.result_status in {ResultStatus.PENDING, ResultStatus.ENTERED}
            ),
            "Clinical Validation": sum(1 for row in rows if row.order_test.result_status == ResultStatus.VERIFIED),
            "Final Reporting": sum(
                1
                for row in rows
                if row.order_test.result_status == ResultStatus.APPROVED
                and (row.report is None or row.report.report_status not in {ReportStatus.ISSUED, ReportStatus.APPROVED, ReportStatus.GENERATED})
            ),
        }

        notes = {
            "Accessioning": "Pending collection and barcode receipt are accumulating at the front desk.",
            "Analytical Run": "Analytical throughput is lagging behind received specimens.",
            "Clinical Validation": "Verified results are waiting for consultant sign-off.",
            "Final Reporting": "Approved results have not all been packaged into issued reports.",
        }

        items: list[ReportsBottleneckItem] = []
        for stage, count in stage_counts.items():
            ratio = _percent(count, total)
            status, tone = _tone_from_ratio(ratio)
            items.append(
                ReportsBottleneckItem(
                    stage=stage,
                    backlog_count=count,
                    throughput_percent=_to_decimal(max(Decimal("0.00"), Decimal("100.00") - ratio)),
                    status=status,
                    tone=tone,
                    note=notes[stage],
                )
            )
        return items

    @staticmethod
    def _build_distribution(
        rows: list[AnalyticsRow],
        key_builder,
        ordered_labels: list[str],
    ) -> list[ReportsDistributionItem]:
        total = len(rows)
        counts: dict[str, int] = defaultdict(int)
        for row in rows:
            counts[key_builder(row)] += 1

        return [
            ReportsDistributionItem(label=label, count=counts.get(label, 0), percentage=_percent(counts.get(label, 0), total or 1))
            for label in ordered_labels
            if counts.get(label, 0) > 0 or label in {"Male", "Female", "Normal", "Stat", "18-30", "31-45", "46-60"}
        ]

    @staticmethod
    def _build_top_tests(rows: list[AnalyticsRow]) -> list[ReportsHighVolumeTestItem]:
        buckets: dict[str, dict[str, object]] = {}
        for row in rows:
            bucket = buckets.setdefault(
                row.test.id,
                {
                    "test_code": row.test.test_code,
                    "test_name": row.test.test_name,
                    "department_name": row.department.name,
                    "sample_type": row.test.sample_type,
                    "count": 0,
                    "revenue": Decimal("0.00"),
                    "tat_values": [],
                    "abnormal_count": 0,
                    "expected_hours": _to_decimal(Decimal(row.test.turnaround_minutes or 0) / Decimal("60"), "0.01"),
                },
            )
            bucket["count"] = int(bucket["count"]) + 1
            bucket["revenue"] = Decimal(bucket["revenue"]) + row.test.price
            tat_value = ReportsService._row_tat_hours(row)
            if tat_value is not None:
                cast_list = bucket["tat_values"]
                assert isinstance(cast_list, list)
                cast_list.append(tat_value)
            if row.result and (row.result.abnormal_flag or row.result.critical_flag):
                bucket["abnormal_count"] = int(bucket["abnormal_count"]) + 1

        items: list[ReportsHighVolumeTestItem] = []
        for bucket in buckets.values():
            count = int(bucket["count"])
            tat_values = bucket["tat_values"]
            assert isinstance(tat_values, list)
            avg_tat = _to_decimal(sum(tat_values, Decimal("0.00")) / len(tat_values), "0.01") if tat_values else Decimal("0.00")
            expected_hours = bucket["expected_hours"]
            assert isinstance(expected_hours, Decimal)
            if avg_tat == Decimal("0.00") or expected_hours == Decimal("0.00") or avg_tat <= expected_hours:
                efficiency_status = "Optimal"
                efficiency_tone = "good"
            elif avg_tat <= expected_hours * Decimal("1.25"):
                efficiency_status = "Monitor"
                efficiency_tone = "warning"
            else:
                efficiency_status = "Backlogged"
                efficiency_tone = "critical"

            items.append(
                ReportsHighVolumeTestItem(
                    test_code=str(bucket["test_code"]),
                    test_name=str(bucket["test_name"]),
                    department_name=str(bucket["department_name"]),
                    sample_type=str(bucket["sample_type"]),
                    monthly_volume=count,
                    avg_revenue_per_test=_to_decimal(Decimal(bucket["revenue"]) / max(count, 1)),
                    avg_tat_hours=avg_tat,
                    abnormal_rate=_percent(int(bucket["abnormal_count"]), count or 1),
                    efficiency_status=efficiency_status,
                    efficiency_tone=efficiency_tone,
                )
            )

        return sorted(items, key=lambda item: (item.monthly_volume, item.avg_revenue_per_test), reverse=True)[:8]

    @staticmethod
    def _build_recent_reports(rows: list[AnalyticsRow]) -> list[ReportsRecentReportItem]:
        report_map: dict[str, ReportsRecentReportItem] = {}
        visit_fallback_map: dict[str, ReportsRecentReportItem] = {}
        for row in rows:
            if row.report is not None:
                existing = report_map.get(row.report.id)
                if existing is None:
                    report_map[row.report.id] = ReportsRecentReportItem(
                        report_number=row.report.report_number,
                        visit_number=row.visit.visit_number,
                        patient_name=row.patient.full_name,
                        department_name=row.department.name,
                        report_status=row.report.report_status.value,
                        generated_at=row.report.generated_at or row.report.created_at,
                        item_count=1,
                    )
                else:
                    existing.item_count += 1
            else:
                fallback_status = "ready" if row.order_test.result_status in {ResultStatus.APPROVED, ResultStatus.VERIFIED, ResultStatus.ENTERED} else "pending"
                existing_fallback = visit_fallback_map.get(row.visit.id)
                if existing_fallback is None:
                    visit_fallback_map[row.visit.id] = ReportsRecentReportItem(
                        report_number=f"PENDING-{row.visit.visit_number}",
                        visit_number=row.visit.visit_number,
                        patient_name=row.patient.full_name,
                        department_name=row.department.name,
                        report_status=fallback_status,
                        generated_at=row.result.approved_at if row.result and row.result.approved_at else row.visit.updated_at,
                        item_count=1,
                    )
                else:
                    existing_fallback.item_count += 1
                    if fallback_status == "ready":
                        existing_fallback.report_status = "ready"

        items = list(report_map.values())
        if not items:
            items = [item for item in visit_fallback_map.values() if item.report_status != "pending"]

        return sorted(items, key=lambda item: _normalize_datetime(item.generated_at) or datetime.min, reverse=True)[:8]

    @staticmethod
    def _build_notes(
        metric_cards: list[ReportsMetricCard],
        bottlenecks: list[ReportsBottleneckItem],
        top_tests: list[ReportsHighVolumeTestItem],
        gender_distribution: list[ReportsDistributionItem],
    ) -> list[str]:
        notes: list[str] = []
        busiest_test = top_tests[0] if top_tests else None
        highest_bottleneck = max(bottlenecks, key=lambda item: item.backlog_count, default=None)
        dominant_gender = max(gender_distribution, key=lambda item: item.count, default=None)

        if busiest_test:
            notes.append(
                f"{busiest_test.test_name} is the highest-volume assay, averaging {busiest_test.avg_tat_hours} hrs with {busiest_test.abnormal_rate}% abnormality yield."
            )
        if highest_bottleneck and highest_bottleneck.backlog_count > 0:
            notes.append(
                f"{highest_bottleneck.stage} is the main operational constraint with {highest_bottleneck.backlog_count} cases in queue and {highest_bottleneck.status.lower()} risk."
            )
        if dominant_gender and dominant_gender.count > 0:
            notes.append(f"{dominant_gender.label} patients account for the largest share of the current report population at {dominant_gender.percentage}%.")

        revenue_card = next((card for card in metric_cards if card.label == "Revenue MTD"), None)
        if revenue_card is not None:
            notes.append(f"Month-to-date revenue attributed to the selected cohort is Rs {Decimal(revenue_card.value).quantize(Decimal('0.01'))}.")

        return notes[:4]

    @staticmethod
    def _row_tat_hours(row: AnalyticsRow) -> Decimal | None:
        collection_time = None
        if row.specimen and row.specimen.collected_at:
            collection_time = row.specimen.collected_at
        elif row.order_test.created_at:
            collection_time = row.order_test.created_at

        completion_time = None
        if row.result and row.result.approved_at:
            completion_time = row.result.approved_at
        elif row.result and row.result.verified_at:
            completion_time = row.result.verified_at
        elif row.result and row.result.updated_at:
            completion_time = row.result.updated_at

        return _safe_hours(collection_time, completion_time)
