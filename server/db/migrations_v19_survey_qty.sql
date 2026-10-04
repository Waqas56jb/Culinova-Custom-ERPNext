-- Survey line qty integrity: Good + Need Service + OOS must equal Qty.
-- Additive CHECK only — no ALTER/DROP of non-survey tables.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM survey_visit_lines
    WHERE (coalesce(qty_good, 0) + coalesce(qty_ns, 0) + coalesce(qty_oos, 0)) <> coalesce(qty, 0)
  ) THEN
    RAISE EXCEPTION 'survey_visit_lines has rows where qty_good + qty_ns + qty_oos <> qty';
  END IF;
END $$;

ALTER TABLE survey_visit_lines
  DROP CONSTRAINT IF EXISTS survey_line_qty_sum_chk;

ALTER TABLE survey_visit_lines
  ADD CONSTRAINT survey_line_qty_sum_chk
  CHECK (qty_good + qty_ns + qty_oos = qty);

-- Private survey photo bucket (service role uploads; clients use signed URLs).
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'survey-photos',
    'survey-photos',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  )
  ON CONFLICT (id) DO NOTHING;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'storage.buckets not available — survey helper will create the bucket';
  WHEN OTHERS THEN
    RAISE NOTICE 'survey-photos bucket insert skipped: %', SQLERRM;
END $$;
