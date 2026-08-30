-- Sprint 4 Block 1 — Brand Master "preferred" flag (§10 commercial recommendations)
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS preferred boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN brands.preferred IS
  'S4B1: when true, recommendation engine may show "Preferred Brand" and boost ranking';

NOTIFY pgrst, 'reload schema';
