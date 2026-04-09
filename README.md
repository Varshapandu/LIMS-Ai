# AI-LIMS — AI-Powered Laboratory Information Management System

A full-stack **Laboratory Information Management System** with intelligent diagnostic workflows, real-time event processing, and comprehensive lab operations support.

## Architecture

```
┌──────────────────────┐        ┌──────────────────────┐
│   Next.js Frontend   │◄──────►│   FastAPI Backend     │
│   (App Router, TS)   │  REST  │   (SQLAlchemy, JWT)   │
│   Port 3000          │        │   Port 8000            │
└──────────────────────┘        └──────────┬───────────┘
                                           │
                                   ┌───────▼───────┐
                                   │   Database     │
                                   │   SQLite (dev) │
                                   │   PostgreSQL   │
                                   └───────────────┘
```

## Tech Stack

| Layer      | Technology                                       |
|------------|--------------------------------------------------|
| Frontend   | Next.js 14 (App Router), TypeScript, Vanilla CSS |
| Backend    | FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2    |
| Database   | SQLite (dev), PostgreSQL-ready via psycopg        |
| Auth       | JWT (python-jose) + bcrypt                        |
| Email      | SMTP with HTML + PDF attachment support            |
| Fonts      | Plus Jakarta Sans, Outfit (Google Fonts)           |

## Modules

| Module             | Route              | Description                                    |
|--------------------|--------------------|------------------------------------------------|
| Login              | `/`                | JWT authentication with role selection          |
| Dashboard          | `/dashboard`       | System overview, trends, capacity, alerts       |
| Billing            | `/billing`         | Invoice creation, payments, test ordering       |
| Specimen Collection| `/collection`      | Barcode scanning, specimen tracking             |
| Result Entry       | `/results`         | Lab test result data entry and validation       |
| Approvals          | `/approvals`       | Doctor review, analysis, report approval        |
| Reference Ranges   | `/reference-ranges`| Admin panel for test reference range management |
| Reports            | `/reports`         | Analytics, department performance, bottlenecks  |

## Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.12
- **pip** (Python package manager)

### 1. Clone & Install

```bash
git clone git@github.com:Varshapandu/LIMS-Ai.git
cd LIMS-Ai
npm install
```

### 2. Backend Setup

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. Environment Configuration

**Backend** — Copy the template and fill in your values:

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your JWT_SECRET and SMTP credentials
```

| Variable          | Description                              | Required |
|-------------------|------------------------------------------|----------|
| `JWT_SECRET`      | Strong random secret for token signing   | ✅        |
| `DATABASE_URL`    | Database connection string               | ✅        |
| `ENVIRONMENT`     | `dev` / `staging` / `prod`               | ✅        |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins             | ✅        |
| `SMTP_HOST`       | SMTP server for email reports            | Optional |
| `SMTP_PASSWORD`   | SMTP app password                        | Optional |

**Frontend** — Copy the template:

```bash
cp .env.local.example .env.local
```

| Variable                    | Description                          | Default                    |
|-----------------------------|--------------------------------------|----------------------------|
| `NEXT_PUBLIC_API_BASE_URL`  | Backend API URL                      | `http://127.0.0.1:8000`   |
| `NEXT_PUBLIC_DEMO_MODE`     | Enable demo credentials on login     | `true`                     |

### 4. Run Development Servers

```bash
# Terminal 1 — Backend
cd backend
python -m uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Overview

All endpoints (except login) require a `Authorization: Bearer <token>` header.

| Method | Endpoint                          | Auth | Description                    |
|--------|-----------------------------------|------|--------------------------------|
| POST   | `/api/auth/login`                 | ❌   | Authenticate and get JWT       |
| GET    | `/api/dashboard/snapshot`         | ✅   | Full dashboard data            |
| POST   | `/api/billing/invoices`           | ✅   | Create invoice with test lines |
| POST   | `/api/billing/payments`           | ✅   | Record payment                 |
| POST   | `/api/patients`                   | ✅   | Register new patient           |
| GET    | `/api/specimens/worklist`         | ✅   | Specimen collection worklist   |
| GET    | `/api/results/worklist`           | ✅   | Result entry worklist          |
| POST   | `/api/results/approve`            | ✅   | Approve visit results          |
| GET    | `/api/reports/analytics`          | ✅   | Reports & analytics data       |
| GET    | `/api/reference-ranges`           | ✅   | List reference ranges          |
| GET    | `/api/catalog/tests`              | ✅   | Search test catalog            |
| GET    | `/api/search/worklist`            | ✅   | Universal search               |
| GET    | `/health`                         | ❌   | Health check                   |

## Project Structure

```
ai-lims/
├── app/                        # Next.js App Router pages
│   ├── components/             # Shared React components
│   │   ├── app-shell.tsx       # Main layout (sidebar, topbar)
│   │   ├── chatbot.tsx         # AI chatbot widget
│   │   └── icons.tsx           # SVG icon components
│   ├── lib/                    # Client utilities
│   │   ├── api.ts              # API request helper (auto-attaches JWT)
│   │   ├── auth-storage.ts     # Auth session management
│   │   └── ...
│   ├── dashboard/page.tsx      # Dashboard page
│   ├── billing/page.tsx        # Billing page
│   ├── collection/page.tsx     # Specimen collection page
│   ├── results/page.tsx        # Result entry page
│   ├── approvals/page.tsx      # Approvals page
│   ├── reference-ranges/page.tsx
│   ├── reports/page.tsx
│   ├── globals.css             # Shared design tokens & layout
│   └── layout.tsx              # Root layout
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── contracts.py    # Pydantic request/response models
│   │   │   └── routes/         # FastAPI route handlers
│   │   ├── core/
│   │   │   ├── auth_deps.py    # JWT auth dependency
│   │   │   ├── config.py       # Settings with validation
│   │   │   └── realtime_events.py
│   │   ├── db/                 # Database session & init
│   │   ├── models/             # SQLAlchemy models
│   │   ├── services/           # Business logic services
│   │   └── main.py             # FastAPI app entry point
│   ├── .env.example            # Environment template
│   └── requirements.txt
├── .eslintrc.json
├── .prettierrc
├── .gitignore
└── package.json
```

## Development

```bash
# Lint frontend
npm run lint

# Format frontend
npm run format

# Lint backend (requires ruff: pip install ruff)
cd backend && ruff check .

# Format backend
cd backend && ruff format .
```

## License

Private — All rights reserved.
