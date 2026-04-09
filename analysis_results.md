# AI-LIMS Project Analysis & Improvement Suggestions

## Project Summary

**AI-LIMS** is a full-stack Laboratory Information Management System built with:

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, vanilla CSS |
| Backend | FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2 |
| Database | SQLite (dev), PostgreSQL-ready via psycopg |
| Auth | JWT (python-jose) + bcrypt |
| Email | SMTP with HTML + PDF attachment support |

**Modules:** Login → Dashboard → Billing → Specimen Collection → Result Entry → Approvals → Reports → Reference Ranges

---

## 🔴 1. Critical Security Issues

> [!CAUTION]
> These should be fixed immediately before any deployment.

### 1.1 Credentials Committed to Source Control
[.env](file:///c:/Users/varsh/Desktop/Ai-lims/backend/.env) contains **real SMTP credentials** (Gmail app password on line 9). This file is not gitignored and exposes live credentials.

**Fix:** Add `backend/.env` to `.gitignore`, rotate the compromised password, and use `.env.example` with placeholder values only.

### 1.2 Hardcoded JWT Secret
[config.py](file:///c:/Users/varsh/Desktop/Ai-lims/backend/app/core/config.py#L10) defaults to `jwt_secret: str = "change-me"`. If the `.env` is missing, all tokens are signed with a predictable key.

**Fix:** Remove the default value and fail at startup if `JWT_SECRET` is not set in production.

### 1.3 Wide-Open CORS Policy
[main.py](file:///c:/Users/varsh/Desktop/Ai-lims/backend/app/main.py#L23) sets `allow_origins=["*"]` with `allow_credentials=True`. This enables any origin to make authenticated requests.

**Fix:** Restrict to explicit frontend origins (e.g., `["http://localhost:3000"]`) and configure per-environment.

### 1.4 No Auth Middleware on API Routes
None of the API routes (billing, results, patients, etc.) validate the JWT token. Anyone can call `/api/billing/invoice` without authentication.

**Fix:** Add a FastAPI dependency that extracts & verifies the JWT from the `Authorization` header and injects the current user into each route.

### 1.5 Demo Credentials Hardcoded in Frontend
[page.tsx](file:///c:/Users/varsh/Desktop/Ai-lims/app/page.tsx#L16-L17) exposes `admin@ailims.com / admin123` and auto-fills them. If the backend is unreachable, it falls back to a local login bypass with no real authentication.

**Fix:** Move demo mode behind an environment flag (`NEXT_PUBLIC_DEMO_MODE`). Never ship demo credentials in production builds.

---

## 🟠 2. Architecture & Design

### 2.1 Monolithic CSS File — 4,100+ Lines
[globals.css](file:///c:/Users/varsh/Desktop/Ai-lims/app/globals.css) is a single 72 KB file containing every style. This is unmaintainable and causes unnecessary style loading.

**Fix:** Split into CSS Modules or per-component files:
- `login.module.css`
- `dashboard.module.css`
- `billing.module.css`
- Shared tokens in a `design-tokens.css`

### 2.2 Giant Page Components (20–44 KB each)
The page files are massive monoliths:

| Page | Size |
|------|------|
| [approvals/page.tsx](file:///c:/Users/varsh/Desktop/Ai-lims/app/approvals/page.tsx) | 44 KB |
| [reports/page.tsx](file:///c:/Users/varsh/Desktop/Ai-lims/app/reports/page.tsx) | 42 KB |
| [billing/page.tsx](file:///c:/Users/varsh/Desktop/Ai-lims/app/billing/page.tsx) | 41 KB |
| [results/page.tsx](file:///c:/Users/varsh/Desktop/Ai-lims/app/results/page.tsx) | 40 KB |
| [collection/page.tsx](file:///c:/Users/varsh/Desktop/Ai-lims/app/collection/page.tsx) | 20 KB |

**Fix:** Extract reusable components (`DataTable`, `StatCard`, `WorklistRow`, `FilterBar`, `Modal`) into `components/`. Each page file should ideally be under 500 lines.

### 2.3 Empty `components/` Directory at Root
The top-level [components/](file:///c:/Users/varsh/Desktop/Ai-lims/components) directory is empty while shared components live in [app/components/](file:///c:/Users/varsh/Desktop/Ai-lims/app/components). This creates confusion.

**Fix:** Delete the empty root `components/` directory and establish `app/components/` as the canonical location.

### 2.4 `@app.on_event("startup")` is Deprecated
[main.py](file:///c:/Users/varsh/Desktop/Ai-lims/backend/app/main.py#L41) uses `@app.on_event("startup")` which is deprecated in FastAPI.

**Fix:** Use the modern `lifespan` context manager pattern:
```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        init_reference_data(db)
    finally:
        db.close()
    yield

app = FastAPI(lifespan=lifespan, ...)
```

### 2.5 No API Versioning
All routes are under `/api/` with no version prefix.

**Fix:** Use `/api/v1/` prefix to allow non-breaking API evolution.

---

## 🟡 3. Backend Code Quality

### 3.1 Result Service is 704 Lines
[result_service.py](file:///c:/Users/varsh/Desktop/Ai-lims/backend/app/services/result_service.py) handles worklists, result entry, approvals, report generation, email dispatch, flag evaluation, and glucose trend building — all in one class.

**Fix:** Split into focused services:
- `ResultEntryService` — saving/validating results
- `ApprovalService` — visit approval workflow
- `ReportGenerationService` — report creation & dispatch
- `FlagEvaluationService` — abnormal/critical flag logic

### 3.2 Hardcoded Medical Logic
[result_service.py](file:///c:/Users/varsh/Desktop/Ai-lims/backend/app/services/result_service.py#L559-L575) has inline medical rules (e.g., `HbA1c >= 6.5` = "Uncontrolled", `Sodium >= 150` = "Severe"). This mixes domain knowledge with service logic.

**Fix:** Move clinical decision rules to a configurable rules engine or database-driven configuration.

### 3.3 Hardcoded Doctor Identity
[result_service.py](file:///c:/Users/varsh/Desktop/Ai-lims/backend/app/services/result_service.py#L112-L113) returns `doctor_name="Dr. Alistair Thorne"` and `doctor_role="Chief Pathologist"` — hardcoded values instead of the actual authenticated user.

**Fix:** Pass the authenticated user context and use the real doctor's name.

### 3.4 Hardcoded Glucose Trend Data
[result_service.py](file:///c:/Users/varsh/Desktop/Ai-lims/backend/app/services/result_service.py#L578-L582) fabricates historical glucose values with a fixed array. This misleads clinical users.

**Fix:** Query actual historical results for the patient, or clearly label the data as "sample/demo."

### 3.5 `datetime.utcnow()` Usage
[realtime_events.py](file:///c:/Users/varsh/Desktop/Ai-lims/backend/app/core/realtime_events.py#L79) uses `datetime.utcnow()` which is deprecated in Python 3.12+.

**Fix:** Use `datetime.now(timezone.utc)` consistently (which the services already do — just this one file is inconsistent).

### 3.6 Missing Error Handling in Routes
The route handlers call service methods that raise `ValueError`, but don't have consistent error handling:

**Fix:** Add a global exception handler:
```python
@app.exception_handler(ValueError)
async def value_error_handler(request, exc):
    return JSONResponse(status_code=400, content={"detail": str(exc)})
```

### 3.7 Mixed Use of `Optional[T]` and `T | None`
[contracts.py](file:///c:/Users/varsh/Desktop/Ai-lims/backend/app/api/contracts.py) mixes `Optional[str]` and `str | None` styles.

**Fix:** Standardize on `T | None` (modern Python 3.10+ style) throughout.

---

## 🔵 4. Frontend Code Quality

### 4.1 No State Management Library
The app relies entirely on `useState` + `useEffect` + localStorage. Complex pages like billing and results duplicate significant state logic.

**Fix:** Consider:
- **React Context** for auth/user state
- **SWR or React Query** for API data fetching with caching and revalidation (would also eliminate the manual 5-second polling)

### 4.2 Aggressive Polling (5 seconds)
[dashboard/page.tsx](file:///c:/Users/varsh/Desktop/Ai-lims/app/dashboard/page.tsx#L146-L150) polls the API every 5 seconds, even if no data changed. This creates unnecessary load.

**Fix:** Use Server-Sent Events (the backend already has `RealtimeEventManager` with `to_sse_format` — it's just never exposed as an endpoint). Or increase the poll interval to 30+ seconds with a manual refresh button.

### 4.3 No Loading Skeletons
Pages show `"..."` during data load. This is a poor UX for a medical application.

**Fix:** Add skeleton loading states with shimmer animations for stat cards, tables, and charts.

### 4.4 No Error Boundaries
Only a single [error.tsx](file:///c:/Users/varsh/Desktop/Ai-lims/app/error.tsx) exists. Individual pages don't gracefully handle partial failures.

**Fix:** Add error boundaries per route segment and graceful degradation for individual API failures.

### 4.5 Inline Type Definitions
[dashboard/page.tsx](file:///c:/Users/varsh/Desktop/Ai-lims/app/dashboard/page.tsx#L13-L54) defines API response types inline in each page file, duplicating type definitions across pages.

**Fix:** Create a shared `app/types/api.ts` file with all API response types.

### 4.6 No Form Validation Library
Login and billing forms use manual validation.

**Fix:** Consider adding a lightweight form library like `react-hook-form` with `zod` for schema validation.

---

## 🟣 5. Database & Data Integrity

### 5.1 SQLite in Development, No PostgreSQL CI Path
The app defaults to SQLite but includes `psycopg` for PostgreSQL. There's no docker-compose or migration test pipeline.

**Fix:** Add a `docker-compose.yml` with PostgreSQL for local dev, and test Alembic migrations in CI.

### 5.2 `Base.metadata.create_all()` at Startup
[main.py](file:///c:/Users/varsh/Desktop/Ai-lims/backend/app/main.py#L43) creates tables directly, bypassing Alembic. This can conflict with migration state.

**Fix:** Use Alembic exclusively for schema management. Remove `create_all()` for non-SQLite databases.

### 5.3 No Database Indexes on Frequent Query Columns
Columns like `Visit.visit_number`, `OrderTest.barcode_value`, and `Invoice.invoice_number` are queried frequently but only have unique constraints (which do create implicit indexes). However, `OrderTest.visit_id` and `OrderTest.patient_id` lack indexes despite being used in multi-table joins.

**Fix:** Add explicit indexes on foreign keys that are frequently joined: `OrderTest.visit_id`, `OrderTest.patient_id`, `Specimen.order_test_id`, `ResultRecord.order_test_id`.

### 5.4 No Soft Delete Pattern
Deleting records (e.g., reference ranges) is a hard delete. In a medical system, audit trails are critical.

**Fix:** Add `is_deleted` flag and `deleted_at` timestamp. Never physically delete records.

### 5.5 No Audit Log Table
There's no record of who changed what and when. The `SpecimenEvent` table is a good start, but only covers specimens.

**Fix:** Create a generic `audit_events` table that logs all state transitions across all entities.

---

## ⚙️ 6. DevOps & Developer Experience

### 6.1 No `.gitignore` in Root
Critical files that should be ignored: `node_modules/`, `.next/`, `backend/__pycache__/`, `backend/*.db`, `backend/.env`, `.codex-*.log`.

### 6.2 No Linter / Formatter Configuration
No ESLint, Prettier, Ruff, or Black configuration exists.

**Fix:** Add:
- Frontend: `eslint.config.js` + `prettier.config.js`
- Backend: `ruff.toml` or `pyproject.toml` with ruff config

### 6.3 No Test Suite
The only test file is [test_reference_data.py](file:///c:/Users/varsh/Desktop/Ai-lims/backend/app/db/test_reference_data.py) (17 KB). No unit tests for services, no integration tests for API routes, no frontend tests.

**Fix:** Add pytest for backend services/routes, and consider Playwright or Cypress for end-to-end frontend tests.

### 6.4 No README at Project Root
There's a [backend/README.md](file:///c:/Users/varsh/Desktop/Ai-lims/backend/README.md) but no root-level README explaining the full project, setup instructions, or architecture.

### 6.5 No CI/CD Configuration
No GitHub Actions, GitLab CI, or any pipeline definition.

---

## 🟢 7. Feature & UX Gaps

### 7.1 No Role-Based Access Control (RBAC) in Frontend
The login page shows role pills (Admin, Lab Technician, Doctor), and the backend has a `roles` table, but the frontend never restricts page access based on role.

**Fix:** Add route guards that check user role before rendering pages (e.g., only Admins see billing, only Doctors see approvals).

### 7.2 No Responsive / Mobile Design
The sidebar is fixed at 320px. There are no media queries for mobile or tablet.

**Fix:** Add a collapsible sidebar and responsive breakpoints.

### 7.3 Chatbot Agent Has No Backend Integration
[chatbot-agent.ts](file:///c:/Users/varsh/Desktop/Ai-lims/app/lib/chatbot-agent.ts) (18 KB) appears to be a client-side only agent. There's no AI/LLM backend integration.

**Fix:** Either integrate with an LLM API for real assistant capabilities, or clearly label it as a guided command menu.

### 7.4 No Patient Search / Filtering
The search bar in the topbar doesn't appear to have a comprehensive patient search that works across visits, barcodes, and patient details in one unified view.

### 7.5 No Data Export Beyond JSON
The dashboard only exports as JSON. Clinical labs need PDF and CSV export capabilities.

---

## Priority Matrix

| Priority | Category | Items |
|----------|----------|-------|
| 🔴 **P0 — Now** | Security | 1.1 credentials leak, 1.2 JWT secret, 1.4 no auth middleware |
| 🔴 **P0 — Now** | Security | 1.3 CORS, 1.5 demo credentials |
| 🟠 **P1 — Soon** | Architecture | 2.1 CSS splitting, 2.2 component extraction |
| 🟠 **P1 — Soon** | DevOps | 6.1 gitignore, 6.2 linters, 6.4 README |
| 🟡 **P2 — Next Sprint** | Backend | 3.1 service splitting, 3.6 error handling |
| 🟡 **P2 — Next Sprint** | Database | 5.4 soft deletes, 5.5 audit logs |
| 🔵 **P3 — Backlog** | Frontend | 4.1 state management, 4.3 skeletons |
| 🟢 **P4 — Roadmap** | Features | 7.1 RBAC, 7.2 responsive, 7.5 exports |

---

> [!IMPORTANT]
> The most urgent action is **rotating the SMTP credentials** exposed in `backend/.env` and adding proper `.gitignore` rules. If this repo has ever been pushed to a remote, consider those credentials compromised.

Let me know which improvements you'd like to tackle first and I'll create an implementation plan!
