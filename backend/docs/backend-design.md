# Backend Design Notes

## Core workflow mapping

### 1. Authentication

- `roles`
- `users`
- `user_sessions`

This supports Admin, Lab Technician, Doctor, and later fine-grained permissions.

### 2. Billing and registration

- `patients`
- `patient_guardians`
- `referral_sources`
- `visits`
- `invoices`
- `invoice_items`
- `payments`

One patient can have many visits.
One visit creates one invoice.
One invoice can have multiple invoice items and multiple payment records.

### 3. Order creation after billing

- `order_headers`
- `order_tests`
- `test_catalog`
- `test_panels`
- `test_panel_items`

Each billed visit creates one order header and many order tests.
Barcode is stored at `order_tests.barcode_value` because every requested test needs its own traceable sample identity.

### 4. Specimen collection and lab tracking

- `specimens`
- `specimen_events`

`specimens` stores current truth.
`specimen_events` stores movement history and makes audit trails easier.

### 5. Result entry and approval

- `result_records`
- `result_history`
- `instruments`

Current result is stored in `result_records`.
Every change is versioned in `result_history`.

### 6. Report lifecycle

- `reports`
- `report_items`

This supports draft, approved, issued, and revised report states without overwriting workflow history.

### 7. Dashboard, alerts, and notifications

- `alerts`
- `notifications`
- `dashboard_daily_metrics`

Dashboard cards can come directly from live transactional tables at first.
Later, `dashboard_daily_metrics` can be populated by scheduled jobs for faster chart rendering.

### 8. Auditability and compliance

- `audit_logs`

Every sensitive workflow transition should create an audit row.

## Important backend decisions

### Separate visit, invoice, and order

These are intentionally different objects:

- `visit`: clinical and operational encounter
- `invoice`: financial document
- `order_header`: lab execution container

This keeps finance and lab processing cleanly separated.

### Separate order test from specimen and result

One test request becomes:

- requested in `order_tests`
- physically handled in `specimens`
- analytically resolved in `result_records`

That split is important because rejection, recollection, and amendment are normal in labs.

### Zero-state friendly dashboard

The UI currently starts at zero. This schema supports that cleanly because dashboard counts derive from operational tables and do not require fake seed data.

## Initial API modules to implement

- `POST /auth/login`
- `POST /patients`
- `POST /visits`
- `POST /billing/invoices`
- `POST /orders`
- `GET /orders/{visit_number}/tests`
- `PATCH /specimens/{barcode}`
- `PATCH /results/{order_test_id}`
- `POST /reports/generate`
- `GET /dashboard/overview`

## Assumptions used

- PostgreSQL is the primary database
- Every requested test has one barcode and one specimen record
- Role-based access is enough for phase 1
- Multi-branch support can be added later by introducing a `locations` table and FK references
