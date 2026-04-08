CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_status AS ENUM ('active', 'inactive', 'locked');
CREATE TYPE sex_type AS ENUM ('male', 'female', 'other', 'unknown');
CREATE TYPE visit_status AS ENUM ('draft', 'billed', 'collected', 'processing', 'completed', 'approved', 'reported', 'cancelled');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'partial', 'refunded', 'cancelled');
CREATE TYPE specimen_status AS ENUM ('pending', 'collected', 'received', 'processing', 'rejected', 'disposed');
CREATE TYPE result_status AS ENUM ('pending', 'entered', 'verified', 'approved', 'amended');
CREATE TYPE report_status AS ENUM ('draft', 'generated', 'approved', 'issued', 'revised');
CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE notification_channel AS ENUM ('in_app', 'sms', 'email', 'whatsapp');
CREATE TYPE entity_kind AS ENUM (
  'patient',
  'visit',
  'invoice',
  'payment',
  'order_header',
  'order_test',
  'specimen',
  'result_record',
  'report',
  'alert'
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id),
  department_id UUID REFERENCES departments(id),
  employee_code VARCHAR(40) UNIQUE,
  full_name VARCHAR(180) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  phone VARCHAR(30),
  password_hash TEXT NOT NULL,
  status user_status NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE referral_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) UNIQUE,
  name VARCHAR(180) NOT NULL,
  source_type VARCHAR(50) NOT NULL DEFAULT 'doctor',
  contact_person VARCHAR(180),
  phone VARCHAR(30),
  email VARCHAR(180),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_code VARCHAR(40) NOT NULL UNIQUE,
  first_name VARCHAR(120) NOT NULL,
  middle_name VARCHAR(120),
  last_name VARCHAR(120),
  full_name VARCHAR(240) NOT NULL,
  date_of_birth DATE,
  age_years INTEGER,
  age_months INTEGER,
  sex sex_type NOT NULL DEFAULT 'unknown',
  mobile_number VARCHAR(30),
  email VARCHAR(180),
  address_line1 VARCHAR(220),
  address_line2 VARCHAR(220),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  national_id VARCHAR(80),
  external_mrn VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE patient_guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  guardian_name VARCHAR(180) NOT NULL,
  relationship VARCHAR(80),
  phone VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE test_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id),
  test_code VARCHAR(40) NOT NULL UNIQUE,
  test_name VARCHAR(220) NOT NULL,
  short_name VARCHAR(80),
  sample_type VARCHAR(80) NOT NULL,
  container_type VARCHAR(80) NOT NULL,
  method_name VARCHAR(120),
  unit VARCHAR(60),
  reference_range_text VARCHAR(180),
  turnaround_minutes INTEGER NOT NULL DEFAULT 0,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  critical_low NUMERIC(12,4),
  critical_high NUMERIC(12,4),
  is_calculated BOOLEAN NOT NULL DEFAULT FALSE,
  formula_expression TEXT,
  barcode_prefix VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE test_panels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_code VARCHAR(40) NOT NULL UNIQUE,
  panel_name VARCHAR(220) NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE test_panel_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id UUID NOT NULL REFERENCES test_panels(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES test_catalog(id),
  display_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(panel_id, test_id)
);

CREATE TABLE instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES departments(id),
  instrument_code VARCHAR(40) UNIQUE,
  instrument_name VARCHAR(180) NOT NULL,
  model_name VARCHAR(120),
  serial_number VARCHAR(120),
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  next_maintenance_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  referral_source_id UUID REFERENCES referral_sources(id),
  created_by UUID REFERENCES users(id),
  visit_number VARCHAR(50) NOT NULL UNIQUE,
  visit_type VARCHAR(40) NOT NULL DEFAULT 'op',
  visit_status visit_status NOT NULL DEFAULT 'draft',
  visit_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  clinical_notes TEXT,
  symptoms_text TEXT,
  provisional_diagnosis TEXT,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  invoice_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_status payment_status NOT NULL DEFAULT 'pending',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  source_type VARCHAR(40) NOT NULL DEFAULT 'test',
  source_id UUID,
  item_code VARCHAR(50),
  item_name VARCHAR(220) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  payment_reference VARCHAR(80),
  payment_mode VARCHAR(40) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  payment_status payment_status NOT NULL DEFAULT 'paid',
  received_by UUID REFERENCES users(id),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  remarks TEXT
);

CREATE TABLE order_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id),
  order_number VARCHAR(50) NOT NULL UNIQUE,
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ordered_by UUID REFERENCES users(id),
  status visit_status NOT NULL DEFAULT 'billed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES order_headers(id) ON DELETE CASCADE,
  visit_id UUID NOT NULL REFERENCES visits(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  test_id UUID NOT NULL REFERENCES test_catalog(id),
  panel_id UUID REFERENCES test_panels(id),
  barcode_value VARCHAR(80) NOT NULL UNIQUE,
  sample_type VARCHAR(80) NOT NULL,
  container_type VARCHAR(80) NOT NULL,
  priority VARCHAR(30) NOT NULL DEFAULT 'normal',
  tat_due_at TIMESTAMPTZ,
  order_status visit_status NOT NULL DEFAULT 'billed',
  result_status result_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE specimens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_test_id UUID NOT NULL UNIQUE REFERENCES order_tests(id) ON DELETE CASCADE,
  specimen_number VARCHAR(60) NOT NULL UNIQUE,
  specimen_status specimen_status NOT NULL DEFAULT 'pending',
  collected_at TIMESTAMPTZ,
  collected_by UUID REFERENCES users(id),
  received_at TIMESTAMPTZ,
  received_by UUID REFERENCES users(id),
  rejected_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES users(id),
  rejection_reason TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE specimen_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  specimen_id UUID NOT NULL REFERENCES specimens(id) ON DELETE CASCADE,
  event_name VARCHAR(80) NOT NULL,
  from_status specimen_status,
  to_status specimen_status,
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_by UUID REFERENCES users(id),
  remarks TEXT
);

CREATE TABLE result_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_test_id UUID NOT NULL UNIQUE REFERENCES order_tests(id) ON DELETE CASCADE,
  specimen_id UUID REFERENCES specimens(id),
  instrument_id UUID REFERENCES instruments(id),
  entered_by UUID REFERENCES users(id),
  verified_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  result_status result_status NOT NULL DEFAULT 'pending',
  result_text TEXT,
  numeric_value NUMERIC(14,4),
  unit VARCHAR(60),
  reference_range_text VARCHAR(180),
  abnormal_flag VARCHAR(20),
  critical_flag BOOLEAN NOT NULL DEFAULT FALSE,
  entered_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE result_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_record_id UUID NOT NULL REFERENCES result_records(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL,
  changed_by UUID REFERENCES users(id),
  change_reason TEXT,
  snapshot_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(result_record_id, revision_no)
);

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id),
  report_number VARCHAR(60) NOT NULL UNIQUE,
  report_status report_status NOT NULL DEFAULT 'draft',
  file_url TEXT,
  generated_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  delivered_at TIMESTAMPTZ,
  delivered_via notification_channel,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE report_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  order_test_id UUID NOT NULL REFERENCES order_tests(id),
  display_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(report_id, order_test_id)
);

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type entity_kind NOT NULL,
  entity_id UUID NOT NULL,
  severity alert_severity NOT NULL,
  alert_code VARCHAR(60),
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL DEFAULT 'in_app',
  subject VARCHAR(180),
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  delivery_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dashboard_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE NOT NULL UNIQUE,
  patient_count INTEGER NOT NULL DEFAULT 0,
  billed_visits INTEGER NOT NULL DEFAULT 0,
  total_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  pending_tests INTEGER NOT NULL DEFAULT 0,
  completed_tests INTEGER NOT NULL DEFAULT 0,
  approved_reports INTEGER NOT NULL DEFAULT 0,
  critical_alerts INTEGER NOT NULL DEFAULT 0,
  average_tat_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  entity_type entity_kind NOT NULL,
  entity_id UUID,
  action VARCHAR(80) NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_patients_full_name ON patients(full_name);
CREATE INDEX idx_patients_mobile_number ON patients(mobile_number);
CREATE INDEX idx_visits_patient_id ON visits(patient_id);
CREATE INDEX idx_visits_visit_date ON visits(visit_date);
CREATE INDEX idx_invoices_visit_id ON invoices(visit_id);
CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX idx_order_headers_visit_id ON order_headers(visit_id);
CREATE INDEX idx_order_tests_order_id ON order_tests(order_id);
CREATE INDEX idx_order_tests_test_id ON order_tests(test_id);
CREATE INDEX idx_order_tests_barcode_value ON order_tests(barcode_value);
CREATE INDEX idx_specimens_status ON specimens(specimen_status);
CREATE INDEX idx_result_records_status ON result_records(result_status);
CREATE INDEX idx_reports_visit_id ON reports(visit_id);
CREATE INDEX idx_alerts_entity ON alerts(entity_type, entity_id);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
