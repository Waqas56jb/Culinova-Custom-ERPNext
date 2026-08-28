-- Sprint 1a Block 3: field-level item pricing history (valuation_rate, factor overrides)
-- Legacy rows keep field NULL (= cost/selling snapshots from before Block 3)

ALTER TABLE item_pricing_history
  ADD COLUMN IF NOT EXISTS field text,
  ADD COLUMN IF NOT EXISTS old_value text,
  ADD COLUMN IF NOT EXISTS new_value text;
