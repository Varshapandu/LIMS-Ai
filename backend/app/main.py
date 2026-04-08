from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.billing import router as billing_router
from app.api.routes.catalog import router as catalog_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.patients import router as patients_router
from app.api.routes.reference_ranges import router as reference_ranges_router
from app.api.routes.reports import router as reports_router
from app.api.routes.results import router as results_router
from app.api.routes.search import router as search_router
from app.api.routes.specimens import router as specimens_router
from app.db.init_db import init_reference_data
from app.db.session import SessionLocal, engine
from app.models.models import Base
from app.core.config import settings

app = FastAPI(title=settings.app_name, version=settings.app_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(patients_router, prefix="/api")
app.include_router(billing_router, prefix="/api")
app.include_router(specimens_router, prefix="/api")
app.include_router(results_router, prefix="/api")
app.include_router(reference_ranges_router, prefix="/api")
app.include_router(catalog_router, prefix="/api")
app.include_router(search_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(reports_router, prefix="/api")


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        init_reference_data(db)
    finally:
        db.close()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "app": settings.app_name}
