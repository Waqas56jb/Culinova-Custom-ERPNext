-- Sprint 4 Block 3 — Custom Fabrication + Excel export polish + quotation sent_at

-- Fabrication items are ERP-created exceptions (item_source='fabrication')
ALTER TABLE items ADD COLUMN IF NOT EXISTS item_source text DEFAULT 'eos';
COMMENT ON COLUMN items.item_source IS 'S4B3: eos | fabrication | erp — fabrication bypasses EOS-only create when setting allows';

-- Family-level datasheet (IM §12). Column may already exist from v2/v3 — IF NOT EXISTS is safe.
ALTER TABLE product_families ADD COLUMN IF NOT EXISTS datasheet_url text;

-- Sent timestamp for quotation list column
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- Policy: fabrication_creation = erp (default) | eos
INSERT INTO system_settings (key, value)
VALUES ('fabrication_creation', 'erp')
ON CONFLICT (key) DO NOTHING;
