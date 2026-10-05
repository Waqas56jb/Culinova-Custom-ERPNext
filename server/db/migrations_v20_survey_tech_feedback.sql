-- Technician feedback: submitted visits stay editable until locked;
-- track last modifier; photo condition bucket for mixed lines;
-- photo kind label "Interior or Filter".

ALTER TABLE survey_visits
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_modified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_modified_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_modified_by_name text;

ALTER TABLE survey_photos
  ADD COLUMN IF NOT EXISTS condition_bucket text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'survey_photos_condition_bucket_chk'
  ) THEN
    ALTER TABLE survey_photos
      ADD CONSTRAINT survey_photos_condition_bucket_chk
      CHECK (condition_bucket IS NULL OR condition_bucket IN ('ns', 'oos'));
  END IF;
END $$;

ALTER TABLE survey_photos DROP CONSTRAINT IF EXISTS survey_photos_kind_chk;
ALTER TABLE survey_photos
  ADD CONSTRAINT survey_photos_kind_chk CHECK (kind IN (
    'Equipment',
    'Problem',
    'Nameplate',
    'Control Panel',
    'Interior or Filter',
    'Interior/Filter',
    'Other'
  ));

UPDATE survey_photos SET kind = 'Interior or Filter' WHERE kind = 'Interior/Filter';
