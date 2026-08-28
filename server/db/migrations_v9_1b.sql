-- Sprint 1b Block 1 — line-level additional margin + strategic override reason
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS add_margin_pct numeric DEFAULT 0;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS override_reason text;
