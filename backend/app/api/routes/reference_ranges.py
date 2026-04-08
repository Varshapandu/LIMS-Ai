from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.contracts import (
    ReferenceRangeDeleteResponse,
    ReferenceRangeListItem,
    ReferenceRangeUpsertRequest,
)
from app.db.session import get_db
from app.models.models import ReferenceRange, SexType, TestCatalog

router = APIRouter(prefix="/reference-ranges", tags=["reference-ranges"])


@router.get("", response_model=list[ReferenceRangeListItem])
def list_reference_ranges(
    search: str | None = Query(default=None),
    service_category: str | None = Query(default=None),
    limit: int = Query(default=250, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> list[ReferenceRangeListItem]:
    query = db.query(ReferenceRange, TestCatalog).join(TestCatalog, TestCatalog.id == ReferenceRange.test_id)

    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            or_(
                TestCatalog.test_name.ilike(like),
                TestCatalog.test_code.ilike(like),
                ReferenceRange.reference_range_text.ilike(like),
                ReferenceRange.method_name.ilike(like),
            )
        )

    if service_category:
        query = query.filter(TestCatalog.service_category == service_category)

    rows = (
        query.order_by(TestCatalog.test_name.asc(), ReferenceRange.min_age_years.asc().nullsfirst(), ReferenceRange.sex.asc().nullsfirst())
        .limit(limit)
        .all()
    )

    return [
        ReferenceRangeListItem(
            id=reference_range.id,
            test_id=test.id,
            test_code=test.test_code,
            test_name=test.test_name,
            service_category=test.service_category.value,
            sex=reference_range.sex.value if reference_range.sex else None,
            min_age_years=reference_range.min_age_years,
            max_age_years=reference_range.max_age_years,
            unit=reference_range.unit,
            reference_range_text=reference_range.reference_range_text,
            method_name=reference_range.method_name,
            critical_low=reference_range.critical_low,
            critical_high=reference_range.critical_high,
            is_default=reference_range.is_default,
            updated_at=reference_range.updated_at,
        )
        for reference_range, test in rows
    ]


@router.post("", response_model=ReferenceRangeListItem, status_code=status.HTTP_201_CREATED)
def create_reference_range(payload: ReferenceRangeUpsertRequest, db: Session = Depends(get_db)) -> ReferenceRangeListItem:
    test = db.query(TestCatalog).filter(TestCatalog.id == payload.test_id).first()
    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")

    if payload.is_default:
        db.query(ReferenceRange).filter(ReferenceRange.test_id == payload.test_id).update({ReferenceRange.is_default: False})

    reference_range = ReferenceRange(
        id=str(uuid4()),
        test_id=payload.test_id,
        sex=_parse_sex(payload.sex),
        min_age_years=payload.min_age_years,
        max_age_years=payload.max_age_years,
        unit=payload.unit,
        reference_range_text=payload.reference_range_text,
        method_name=payload.method_name,
        critical_low=_decimal_or_none(payload.critical_low),
        critical_high=_decimal_or_none(payload.critical_high),
        is_default=payload.is_default,
    )
    db.add(reference_range)
    db.commit()
    db.refresh(reference_range)
    return _serialize(reference_range, test)


@router.patch("/{reference_range_id}", response_model=ReferenceRangeListItem)
def update_reference_range(reference_range_id: str, payload: ReferenceRangeUpsertRequest, db: Session = Depends(get_db)) -> ReferenceRangeListItem:
    reference_range = db.query(ReferenceRange).filter(ReferenceRange.id == reference_range_id).first()
    if not reference_range:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reference range not found")

    test = db.query(TestCatalog).filter(TestCatalog.id == payload.test_id).first()
    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")

    if payload.is_default:
        db.query(ReferenceRange).filter(ReferenceRange.test_id == payload.test_id, ReferenceRange.id != reference_range_id).update({ReferenceRange.is_default: False})

    reference_range.test_id = payload.test_id
    reference_range.sex = _parse_sex(payload.sex)
    reference_range.min_age_years = payload.min_age_years
    reference_range.max_age_years = payload.max_age_years
    reference_range.unit = payload.unit
    reference_range.reference_range_text = payload.reference_range_text
    reference_range.method_name = payload.method_name
    reference_range.critical_low = _decimal_or_none(payload.critical_low)
    reference_range.critical_high = _decimal_or_none(payload.critical_high)
    reference_range.is_default = payload.is_default

    db.commit()
    db.refresh(reference_range)
    return _serialize(reference_range, test)


@router.delete("/{reference_range_id}", response_model=ReferenceRangeDeleteResponse)
def delete_reference_range(reference_range_id: str, db: Session = Depends(get_db)) -> ReferenceRangeDeleteResponse:
    reference_range = db.query(ReferenceRange).filter(ReferenceRange.id == reference_range_id).first()
    if not reference_range:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reference range not found")

    db.delete(reference_range)
    db.commit()
    return ReferenceRangeDeleteResponse(id=reference_range_id, deleted=True)


def _serialize(reference_range: ReferenceRange, test: TestCatalog) -> ReferenceRangeListItem:
    return ReferenceRangeListItem(
        id=reference_range.id,
        test_id=test.id,
        test_code=test.test_code,
        test_name=test.test_name,
        service_category=test.service_category.value,
        sex=reference_range.sex.value if reference_range.sex else None,
        min_age_years=reference_range.min_age_years,
        max_age_years=reference_range.max_age_years,
        unit=reference_range.unit,
        reference_range_text=reference_range.reference_range_text,
        method_name=reference_range.method_name,
        critical_low=reference_range.critical_low,
        critical_high=reference_range.critical_high,
        is_default=reference_range.is_default,
        updated_at=reference_range.updated_at,
    )


def _parse_sex(value: str | None) -> SexType | None:
    if not value:
        return None
    normalized = value.strip().lower()
    if not normalized:
        return None
    try:
        return SexType(normalized)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid sex value") from exc


def _decimal_or_none(value: Decimal | None) -> Decimal | None:
    return value if value is not None else None
