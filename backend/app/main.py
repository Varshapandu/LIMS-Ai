from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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
from app.core.config import settings
from app.db.init_db import init_reference_data
from app.db.session import SessionLocal, engine
from app.models.models import Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Modern lifespan handler — replaces deprecated @app.on_event('startup')."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        init_reference_data(db)
    finally:
        db.close()
    yield


app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Global exception handlers
# ---------------------------------------------------------------------------

@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

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


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "app": settings.app_name}
