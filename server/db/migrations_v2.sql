-- ============================================================
-- CULINOVA ERP — v2 MIGRATIONS (run after schema.sql)
-- Item Master (ERPNext parity) · Inventory reservation · Project costing
-- Sales→PM handover · Notifications. Idempotent — safe to re-run.
-- ============================================================

-- ---- MASTERS ----
create table if not exists brands (
  id uuid primary key default gen_random_uuid(), brand text unique not null, description text, image_url text, created_at timestamptz default now());
create table if not exists item_groups (
  id uuid primary key default gen_random_uuid(), item_group_name text unique not null, parent_item_group text, is_group boolean default false, image_url text, created_at timestamptz default now());
create table if not exists item_attributes (
  id uuid primary key default gen_random_uuid(), attribute_name text unique not null, numeric_values boolean default false, from_range numeric, increment numeric, to_range numeric, disabled boolean default false, created_at timestamptz default now());
create table if not exists item_attribute_values (
  id uuid primary key default gen_random_uuid(), attribute_id uuid references item_attributes(id) on delete cascade, attribute_value text, abbr text);

-- ---- ITEM MASTER: full ERPNext-parity columns on items ----
alter table items add column if not exists item_code text;
alter table items add column if not exists item_name text;
alter table items add column if not exists stock_uom text;
alter table items add column if not exists naming_series text;
alter table items add column if not exists variant_of uuid references items(id);
alter table items add column if not exists has_variants boolean default false;
alter table items add column if not exists variant_based_on text default 'Item Attribute';
alter table items add column if not exists disabled boolean default false;
alter table items add column if not exists allow_alternative_item boolean default false;
alter table items add column if not exists is_stock_item boolean default true;
alter table items add column if not exists include_item_in_manufacturing boolean default true;
alter table items add column if not exists opening_stock numeric default 0;
alter table items add column if not exists valuation_rate numeric default 0;
alter table items add column if not exists standard_rate numeric default 0;
alter table items add column if not exists valuation_method text;
alter table items add column if not exists is_fixed_asset boolean default false;
alter table items add column if not exists asset_category text;
alter table items add column if not exists auto_create_assets boolean default false;
alter table items add column if not exists is_grouped_asset boolean default false;
alter table items add column if not exists shelf_life_in_days int;
alter table items add column if not exists end_of_life date;
alter table items add column if not exists default_material_request_type text default 'Purchase';
alter table items add column if not exists warranty_period text;
alter table items add column if not exists weight_per_unit numeric;
alter table items add column if not exists weight_uom text;
alter table items add column if not exists has_batch_no boolean default false;
alter table items add column if not exists create_new_batch boolean default false;
alter table items add column if not exists batch_number_series text;
alter table items add column if not exists has_expiry_date boolean default false;
alter table items add column if not exists retain_sample boolean default false;
alter table items add column if not exists sample_quantity int;
alter table items add column if not exists has_serial_no boolean default false;
alter table items add column if not exists serial_no_series text;
alter table items add column if not exists is_purchase_item boolean default true;
alter table items add column if not exists purchase_uom text;
alter table items add column if not exists min_order_qty numeric default 0;
alter table items add column if not exists safety_stock numeric default 0;
alter table items add column if not exists lead_time_days int default 0;
alter table items add column if not exists last_purchase_rate numeric default 0;
alter table items add column if not exists is_customer_provided_item boolean default false;
alter table items add column if not exists delivered_by_supplier boolean default false;
alter table items add column if not exists country_of_origin text;
alter table items add column if not exists customs_tariff_number text;
alter table items add column if not exists sales_uom text;
alter table items add column if not exists is_sales_item boolean default true;
alter table items add column if not exists max_discount numeric default 0;
alter table items add column if not exists enable_deferred_revenue boolean default false;
alter table items add column if not exists no_of_months int;
alter table items add column if not exists enable_deferred_expense boolean default false;
alter table items add column if not exists no_of_months_exp int;
alter table items add column if not exists inspection_required_before_purchase boolean default false;
alter table items add column if not exists inspection_required_before_delivery boolean default false;
alter table items add column if not exists quality_inspection_template text;
alter table items add column if not exists default_bom text;
alter table items add column if not exists is_sub_contracted_item boolean default false;
alter table items add column if not exists customer_code text;
alter table items add column if not exists over_delivery_receipt_allowance numeric default 0;
alter table items add column if not exists over_billing_allowance numeric default 0;
alter table items add column if not exists default_item_manufacturer text;
alter table items add column if not exists default_manufacturer_part_no text;
alter table items add column if not exists grant_commission boolean default true;
alter table items add column if not exists allow_negative_stock boolean default false;
alter table items add column if not exists production_capacity int;
alter table items add column if not exists supplier_code text;
alter table items add column if not exists sub_group text;
update items set item_code = coalesce(item_code, code), item_name = coalesce(item_name, name), stock_uom = coalesce(stock_uom, uom, 'Nos');

-- ---- ITEM CHILD TABLES ----
create table if not exists item_barcodes (id uuid primary key default gen_random_uuid(), item_id uuid references items(id) on delete cascade, barcode text, barcode_type text, uom text);
create table if not exists item_uoms (id uuid primary key default gen_random_uuid(), item_id uuid references items(id) on delete cascade, uom text, conversion_factor numeric default 1);
create table if not exists item_reorders (id uuid primary key default gen_random_uuid(), item_id uuid references items(id) on delete cascade, warehouse_group text, warehouse text, warehouse_reorder_level numeric default 0, warehouse_reorder_qty numeric default 0, material_request_type text default 'Purchase');
create table if not exists item_suppliers (id uuid primary key default gen_random_uuid(), item_id uuid references items(id) on delete cascade, supplier text, supplier_part_no text);
create table if not exists item_customer_details (id uuid primary key default gen_random_uuid(), item_id uuid references items(id) on delete cascade, customer_name text, customer_group text, ref_code text);
create table if not exists item_taxes (id uuid primary key default gen_random_uuid(), item_id uuid references items(id) on delete cascade, item_tax_template text, tax_category text, valid_from date, minimum_net_rate numeric, maximum_net_rate numeric);
create table if not exists item_defaults (id uuid primary key default gen_random_uuid(), item_id uuid references items(id) on delete cascade, company text, default_warehouse text, default_price_list text, default_supplier text, buying_cost_center text, selling_cost_center text, expense_account text, income_account text, default_inventory_account text, default_cogs_account text, default_discount_account text, deferred_expense_account text, deferred_revenue_account text);
create table if not exists item_variant_attributes (id uuid primary key default gen_random_uuid(), item_id uuid references items(id) on delete cascade, attribute text, attribute_value text, numeric_values boolean default false, from_range numeric, increment numeric, to_range numeric);
create table if not exists item_manufacturers (id uuid primary key default gen_random_uuid(), item_id uuid references items(id) on delete cascade, manufacturer text, manufacturer_part_no text, is_default boolean default false);
create table if not exists item_alternatives (id uuid primary key default gen_random_uuid(), item_id uuid references items(id) on delete cascade, alternative_item_code text, two_way boolean default false);
create table if not exists item_prices (id uuid primary key default gen_random_uuid(), item_id uuid references items(id) on delete cascade, item_code text, uom text, price_list text, buying boolean default false, selling boolean default true, price_list_rate numeric default 0, currency text default 'SAR', customer text, supplier text, valid_from date, valid_upto date, note text, created_at timestamptz default now());
create table if not exists product_bundles (id uuid primary key default gen_random_uuid(), new_item_code text, description text, is_active boolean default true, disabled boolean default false);
create table if not exists product_bundle_items (id uuid primary key default gen_random_uuid(), bundle_id uuid references product_bundles(id) on delete cascade, item_code text, qty numeric default 1, uom text, rate numeric default 0);

-- ---- INVENTORY (reservation + aging) ----
alter table stock_balances add column if not exists reserved numeric default 0;
alter table stock_balances add column if not exists received_at timestamptz default now();
create table if not exists stock_reservations (id uuid primary key default gen_random_uuid(), item_id uuid references items(id) on delete cascade, item_name text, warehouse text, qty numeric default 0, sales_order_id uuid references sales_orders(id) on delete set null, project_id uuid references projects(id) on delete set null, status text default 'Active', release_reason text, requested_by uuid references users(id), released_by uuid references users(id), created_at timestamptz default now());

-- ---- PROJECT COSTING (PM budget/actual) ----
alter table project_boq add column if not exists budget_cost numeric default 0;
alter table project_boq add column if not exists actual_cost numeric default 0;

-- ---- SALES -> PM HANDOVER ----
alter table users      add column if not exists phone text;
alter table quotations add column if not exists delivery_date date;
alter table quotations add column if not exists notes text;
alter table projects   add column if not exists contact_person text;
alter table projects   add column if not exists customer_email text;
alter table projects   add column if not exists customer_phone text;
alter table projects   add column if not exists location text;
alter table projects   add column if not exists payment_terms text;
alter table projects   add column if not exists delivery_date date;
alter table projects   add column if not exists notes text;

-- ---- NOTIFICATIONS (announcements + discount approval) ----
create table if not exists notifications (id uuid primary key default gen_random_uuid(), user_id uuid references users(id) on delete cascade, title text, body text not null, sender text, read boolean default false, type text, ref_type text, ref_id uuid, action_status text, created_at timestamptz default now());

-- ---- ITEM MASTER 2.0 (Ali spec: brand factors, families, price lists, pricing, import) ----
alter table brands add column if not exists currency text default 'SAR';
alter table brands add column if not exists exchange_factor numeric default 1;
alter table brands add column if not exists price_factor numeric default 1;
create table if not exists product_families (id uuid primary key default gen_random_uuid(), name text unique not null, category text, sub_category text, datasheet_url text, image_url text, specs text, created_at timestamptz default now());
create table if not exists supplier_price_lists (id uuid primary key default gen_random_uuid(), name text, brand text, currency text, year text, created_at timestamptz default now());
create table if not exists price_list_items (id uuid primary key default gen_random_uuid(), list_id uuid references supplier_price_lists(id) on delete cascade, brand text, model text, supplier_price numeric, created_at timestamptz default now());
create table if not exists item_pricing_history (id uuid primary key default gen_random_uuid(), item_id uuid references items(id) on delete cascade, brand text, model text, cost numeric, selling_price numeric, source text, created_by uuid references users(id), created_at timestamptz default now());
alter table items add column if not exists description text;
alter table items add column if not exists product_family text;
alter table items add column if not exists category text;
alter table items add column if not exists sub_category text;
alter table items add column if not exists supplier_price numeric;
alter table items add column if not exists landed_cost numeric;
alter table items add column if not exists selling_price numeric;
alter table items add column if not exists gp_percent numeric;
alter table items add column if not exists eta_days int;
