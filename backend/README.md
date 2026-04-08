# AI LIMS Backend Foundation

This backend is designed around the workflow:

`Login -> Billing -> Visit -> Order/Test Requests -> Specimen Collection -> Result Entry -> Approval -> Report -> Dashboard/Alerts`

## Stack Direction

- API: FastAPI
- Database: PostgreSQL
- ORM/Migrations: SQLAlchemy + Alembic
- Auth: JWT with role-based access
- Realtime later: WebSocket/Event bus for dashboard counters and alerts

## Folder Map

- `schema/001_init.sql`: PostgreSQL-first schema
- `app/main.py`: FastAPI app entry
- `app/core/config.py`: app settings
- `app/domain/entities.py`: backend domain contracts and enums
- `app/api/contracts.py`: request/response contracts for first modules

## Why this schema

The schema is intentionally split between:

- Master data: users, roles, departments, test catalog, instruments, referrals
- Patient flow: patients, visits, invoices, payments, orders, order items
- Lab operations: specimens, specimen events, result records, approvals
- Output/control: reports, alerts, notifications, audit logs

That separation keeps the system scalable and lets the dashboard read directly from operational tables without mixing concerns.

## First backend modules to implement next

1. Authentication
2. Billing and invoice generation
3. Visit and order creation
4. Specimen collection/update
5. Result entry and approval
6. Dashboard aggregates

## Report Email Settings

Set these environment variables to email the finalized report to the patient:

- `SMTP_HOST`
- `SMTP_PORT` default `587`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME` default `AI LIMS`
- `SMTP_USE_TLS` default `true`
- `SMTP_USE_SSL` default `false`

The email is triggered during doctor `finalize` in the approval workflow, after the report record is generated.
The recipient is always the `patients.email` value stored during billing registration, or the updated patient email saved later from the billing screen.
