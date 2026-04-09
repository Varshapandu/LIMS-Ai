from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.contracts import CatalogTestItem
from app.core.auth_deps import CurrentUser, get_current_user
from app.db.session import get_db
from app.services.catalog_service import CatalogService

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/tests", response_model=list[CatalogTestItem])
def list_tests(
    query: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[CatalogTestItem]:
    return CatalogService.list_tests(db, query=query, limit=limit)
