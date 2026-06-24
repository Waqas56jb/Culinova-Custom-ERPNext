-- ============================================================
-- CULINOVA Custom ERP — PostgreSQL / Supabase schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================
create extension if not exists "pgcrypto";

-- ---------- helper: auto updated_at ----------
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

-- ============================================================
-- IDENTITY & ACCESS
-- ============================================================
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text unique not null,
  password_hash text not null,
  designation   text,
  department    text,
  role          text not null default 'Sales User',     -- Management, Sales User, Project Manager, ...
  access_level  text not null default 'Create',          -- View Only, Create, Edit, Approval, Full Admin
  status        text not null default 'Active',           -- Active, Disabled
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create trigger trg_users_u before update on users for each row execute function set_updated_at();

create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id),
  user_name   text,
  entity      text not null,          -- e.g. quotation
  entity_id   text,
  action      text not null,          -- created, updated, approved, sent, cancelled, deleted, viewed
  details     jsonb,
  created_at  timestamptz default now()
);

-- ============================================================
-- SALES & ESTIMATION
-- ============================================================
create table if not exists customers (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  name        text not null,
  category    text,                   -- Hotel, Hospital, Restaurant, Central Kitchen, ...
  territory   text,
  contact     text,
  email       text,
  phone       text,
  credit_limit numeric default 0,
  outstanding  numeric default 0,
  status      text default 'Active',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create trigger trg_customers_u before update on customers for each row execute function set_updated_at();

create table if not exists leads (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  company     text,
  source      text,
  status      text default 'Open',     -- Open, Qualified, Opportunity, Converted, Lost, Do Not Contact
  owner_id    uuid references users(id),   -- Rule 1: every lead must have an owner
  est_value   numeric default 0,
  last_activity_at timestamptz default now(),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create trigger trg_leads_u before update on leads for each row execute function set_updated_at();

create table if not exists opportunities (
  id          uuid primary key default gen_random_uuid(),
  customer    text,
  stage       text default 'Lead',     -- Lead, Qualified Lead, Opportunity, Quotation, Negotiation, Verbal Approval, PO Received, Won, Lost
  value       numeric default 0,
  probability int default 30,
  next_action_date date,               -- Rule 2: mandatory
  owner_id    uuid references users(id),
  lost_reason text,                    -- Rule 13: required when Lost
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create trigger trg_opps_u before update on opportunities for each row execute function set_updated_at();

create table if not exists quotations (
  id            uuid primary key default gen_random_uuid(),
  number        text unique not null,
  customer      text not null,
  contact_person text,
  project_name  text,
  project_location text,
  customer_email text,
  validity_days int not null default 30,         -- 15 / 30 / 60
  valid_till    date,
  payment_terms text,
  -- financials (cost/gp visible to Management only at API layer)
  net_amount    numeric default 0,
  discount_pct  numeric default 0,
  discount_amount numeric default 0,
  discount_source text,                          -- Salesperson, Management, CEO
  vat_amount    numeric default 0,
  total_amount  numeric default 0,
  cost_amount   numeric default 0,               -- hidden from sales
  gp_percent    numeric default 0,               -- hidden from sales
  status        text default 'Draft',            -- Draft, Pending Approval, Open, Ordered, Lost, Expired
  approval_status text default 'Not Required',   -- Not Required, Pending, Approved, Rejected
  approved_by   uuid references users(id),
  revision      int default 0,
  owner_id      uuid references users(id),
  created_by    uuid references users(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create trigger trg_quotations_u before update on quotations for each row execute function set_updated_at();

create table if not exists quotation_items (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid references quotations(id) on delete cascade,
  item_name     text not null,
  qty           numeric default 1,
  rate          numeric default 0,                -- selling rate
  cost          numeric default 0,                -- hidden from sales
  amount        numeric default 0
);

create table if not exists quotation_revisions (   -- Rule 10: never deleted
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid references quotations(id) on delete cascade,
  revision      int not null,
  changed_by    uuid references users(id),
  changes       jsonb,
  created_at    timestamptz default now()
);

create table if not exists customer_interactions (  -- Rule 12: meeting log
  id            uuid primary key default gen_random_uuid(),
  customer      text,
  type          text,                 -- Call, Meeting, Email, WhatsApp, Site Visit
  notes         text,
  next_action   text,
  user_id       uuid references users(id),
  created_at    timestamptz default now()
);

create table if not exists sales_orders (
  id          uuid primary key default gen_random_uuid(),
  number      text unique not null,
  quotation_id uuid references quotations(id),
  customer    text not null,
  amount      numeric default 0,
  project_id  uuid,
  delivery_status text default 'To Deliver',
  billing_status  text default 'Not Billed',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create trigger trg_so_u before update on sales_orders for each row execute function set_updated_at();

-- ============================================================
-- PROJECT MANAGEMENT
-- ============================================================
create table if not exists projects (
  id            uuid primary key default gen_random_uuid(),
  number        text unique not null,
  name          text,
  customer      text,
  sales_order_id uuid references sales_orders(id),
  manager_id    uuid references users(id),
  contract_value numeric default 0,
  actual_cost   numeric default 0,
  committed_cost numeric default 0,
  billed        numeric default 0,
  collected     numeric default 0,
  progress      int default 0,
  status        text default 'On Track',  -- On Track, At Risk, Delayed, Completed
  start_date    date,
  end_date      date,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create trigger trg_projects_u before update on projects for each row execute function set_updated_at();

create table if not exists project_boq (        -- required items / scope of supply
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete cascade,
  item_name   text not null,
  qty         numeric default 1,
  assignee_id uuid references users(id),
  status      text default 'Waiting'   -- Waiting, Assigned, In Progress, Delivered, Installed
);

create table if not exists project_tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete cascade,
  name        text not null,
  assignee_id uuid references users(id),
  status      text default 'Open',
  due_date    date,
  progress    int default 0
);

create table if not exists variation_orders (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete cascade,
  description text,
  amount      numeric default 0,
  status      text default 'Pending'
);

-- ============================================================
-- PROCUREMENT
-- ============================================================
create table if not exists suppliers (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  name        text not null,
  category    text,
  rating      numeric default 4,
  on_time     int default 90,
  status      text default 'Active',
  created_at  timestamptz default now()
);

create table if not exists rfqs (
  id          uuid primary key default gen_random_uuid(),
  number      text unique not null,
  item_name   text,
  project_id  uuid references projects(id),
  qty         numeric default 1,
  status      text default 'Open',     -- Open, Quoted, Ordered
  awarded_supplier text,
  created_at  timestamptz default now()
);

create table if not exists rfq_quotes (
  id          uuid primary key default gen_random_uuid(),
  rfq_id      uuid references rfqs(id) on delete cascade,
  supplier    text,
  quote       numeric default 0
);

create table if not exists purchase_orders (
  id          uuid primary key default gen_random_uuid(),
  number      text unique not null,
  supplier    text,
  item_name   text,
  project_id  uuid references projects(id),
  qty         numeric default 1,
  amount      numeric default 0,
  status      text default 'Pending',  -- Pending, Received, Billed
  shipment    text default 'Preparing',
  accepted    boolean default false,
  created_at  timestamptz default now()
);

-- ============================================================
-- WAREHOUSE / STOCK  (Item Master = foundation)
-- ============================================================
create table if not exists warehouses (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  name        text not null,
  location    text,
  type        text default 'Storage'
);

create table if not exists items (             -- ITEM MASTER
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  name        text not null,
  item_group  text,
  brand       text,
  model       text,
  supplier    text,
  uom         text default 'Nos',
  dimensions  text,
  image_url   text,
  datasheet_url text,
  specifications text,
  cost        numeric,
  selling_rate numeric,
  warranty    text,
  reorder_level numeric default 0,
  status      text default 'Active',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create trigger trg_items_u before update on items for each row execute function set_updated_at();

create table if not exists stock_balances (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid references items(id) on delete cascade,
  warehouse   text,
  qty         numeric default 0,
  unique (item_id, warehouse)
);

create table if not exists delivery_notes (
  id          uuid primary key default gen_random_uuid(),
  number      text unique not null,
  project_id  uuid references projects(id),
  customer    text,
  item_name   text,
  qty         numeric default 1,
  value       numeric default 0,
  status      text default 'Delivered',
  created_at  timestamptz default now()
);

create table if not exists goods_receipts (
  id          uuid primary key default gen_random_uuid(),
  number      text unique not null,
  po_id       uuid references purchase_orders(id),
  item_name   text,
  qty         numeric default 1,
  created_at  timestamptz default now()
);

-- ============================================================
-- FINANCE & ACCOUNTING  (ZATCA e-invoicing to be built here)
-- ============================================================
create table if not exists invoices (
  id          uuid primary key default gen_random_uuid(),
  number      text unique not null,
  customer    text not null,
  project_id  uuid references projects(id),
  net_amount  numeric default 0,
  vat_amount  numeric default 0,
  total       numeric default 0,
  paid        numeric default 0,
  due_date    date,
  status      text default 'Unpaid',   -- Unpaid, Partly Paid, Paid, Overdue
  zatca_qr    text,                     -- ZATCA QR payload (to implement)
  zatca_uuid  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create trigger trg_invoices_u before update on invoices for each row execute function set_updated_at();

create table if not exists payments (
  id          uuid primary key default gen_random_uuid(),
  number      text unique not null,
  type        text,                     -- Received, Paid
  party       text,
  reference   text,
  amount      numeric default 0,
  mode        text default 'Bank Transfer',
  created_at  timestamptz default now()
);

create table if not exists payables (
  id          uuid primary key default gen_random_uuid(),
  number      text unique not null,
  supplier    text,
  po_id       uuid references purchase_orders(id),
  amount      numeric default 0,
  paid        numeric default 0,
  status      text default 'Unpaid',
  created_at  timestamptz default now()
);

-- ============================================================
-- SITE EXECUTION
-- ============================================================
create table if not exists snags (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id),
  item_name   text,
  description text,
  severity    text default 'Low',
  status      text default 'Open',
  created_at  timestamptz default now()
);

create table if not exists commissioning_tests (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id),
  test        text,
  status      text default 'Pending'    -- Pending, Passed, Failed
);

-- ============================================================
-- SERVICE & MAINTENANCE
-- ============================================================
create table if not exists service_contracts (
  id          uuid primary key default gen_random_uuid(),
  number      text unique not null,
  customer    text,
  project_id  uuid references projects(id),
  start_date  date,
  end_date    date,
  status      text default 'Active'
);

create table if not exists service_tickets (
  id          uuid primary key default gen_random_uuid(),
  number      text unique not null,
  customer    text,
  project_id  uuid references projects(id),
  subject     text,
  priority    text default 'Medium',
  status      text default 'Open',
  sla         text default 'On Track',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create trigger trg_tickets_u before update on service_tickets for each row execute function set_updated_at();

create table if not exists maintenance_visits (
  id          uuid primary key default gen_random_uuid(),
  number      text unique not null,
  customer    text,
  project_id  uuid references projects(id),
  type        text,
  visit_date  date,
  technician  text,
  status      text default 'Scheduled'
);

-- ============================================================
-- HR & PAYROLL
-- ============================================================
create table if not exists employees (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  name        text not null,
  role        text,
  department  text,
  salary      numeric default 0,
  today_status text default 'Present',  -- Present, Absent, On Leave
  user_id     uuid references users(id),
  created_at  timestamptz default now()
);

create table if not exists leave_requests (
  id          uuid primary key default gen_random_uuid(),
  employee    text,
  type        text,
  from_date   date,
  to_date     date,
  status      text default 'Pending'
);

create table if not exists payroll_runs (
  id          uuid primary key default gen_random_uuid(),
  period      text,
  gross       numeric default 0,
  net         numeric default 0,
  status      text default 'Pending',   -- Pending, Paid
  created_at  timestamptz default now()
);
