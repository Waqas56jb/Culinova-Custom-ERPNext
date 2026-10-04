-- Equipment condition survey as a modular ERP backend.
-- Shared masters: customers (existing) + sites (new). Survey tables are prefixed survey_.

create table if not exists sites (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete restrict,
  name         text not null,
  location     text,
  project_id   uuid references projects(id) on delete set null,
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (customer_id, name)
);
create index if not exists idx_sites_customer on sites (customer_id);
create index if not exists idx_sites_project on sites (project_id);
drop trigger if exists trg_sites_u on sites;
create trigger trg_sites_u before update on sites for each row execute function set_updated_at();

comment on table sites is 'Physical customer locations (kitchen, laundry). Not an ERP project.';

create table if not exists survey_attr_defs (
  key         text primary key,
  label       text not null,
  input_type  text not null default 't',
  options     jsonb,
  created_at  timestamptz default now()
);

create table if not exists survey_equipment_types (
  code        text primary key,
  name        text not null,
  aliases     text,
  category    text not null,
  attr_keys   jsonb not null default '[]'::jsonb,
  created_at  timestamptz default now()
);
create index if not exists idx_survey_types_category on survey_equipment_types (category);
create index if not exists idx_survey_types_name on survey_equipment_types (name);

create table if not exists survey_visits (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references sites(id) on delete restrict,
  technician_id   uuid references users(id) on delete set null,
  technician_name text,
  visited_at      timestamptz not null default now(),
  status          text not null default 'Draft',
  notes           text,
  created_by      uuid references users(id) on delete set null,
  submitted_at    timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  constraint survey_visits_status_chk check (status in ('Draft', 'Submitted'))
);
create index if not exists idx_survey_visits_site on survey_visits (site_id);
create index if not exists idx_survey_visits_status on survey_visits (status);
drop trigger if exists trg_survey_visits_u on survey_visits;
create trigger trg_survey_visits_u before update on survey_visits for each row execute function set_updated_at();

create table if not exists survey_visit_lines (
  id           uuid primary key default gen_random_uuid(),
  visit_id     uuid not null references survey_visits(id) on delete cascade,
  type_code    text not null references survey_equipment_types(code) on delete restrict,
  type_name    text,
  category     text,
  qty          numeric not null default 0,
  qty_good     numeric not null default 0,
  qty_ns       numeric not null default 0,
  qty_oos      numeric not null default 0,
  condition    text,
  notes        text,
  attrs        jsonb not null default '{}'::jsonb,
  item_id      uuid references items(id) on delete set null,
  sort_order   int default 0,
  created_at   timestamptz default now(),
  constraint survey_line_qty_chk check (qty >= 0 and qty_good >= 0 and qty_ns >= 0 and qty_oos >= 0)
);
create index if not exists idx_survey_lines_visit on survey_visit_lines (visit_id);
create index if not exists idx_survey_lines_item on survey_visit_lines (item_id);

create table if not exists survey_photos (
  id           uuid primary key default gen_random_uuid(),
  line_id      uuid not null references survey_visit_lines(id) on delete cascade,
  kind         text not null default 'Equipment',
  path         text not null,
  name         text,
  created_at   timestamptz default now(),
  constraint survey_photos_kind_chk check (kind in (
    'Equipment', 'Nameplate', 'Problem', 'Interior/Filter', 'Control Panel', 'Other'
  ))
);
create index if not exists idx_survey_photos_line on survey_photos (line_id);
