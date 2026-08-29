-- Sprint 3 Block 1 — Quotation hard rules (statuses, lost reasons)
-- Status column is free text — no CHECK/enum needed. New values:
--   Sent | Under Negotiation | Rejected  (+ legacy Open treated as Sent in app)
-- Migrate existing Open rows → Sent (run count before/after in verify).

ALTER TABLE quotations ADD COLUMN IF NOT EXISTS lost_reason text;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS lost_reason_note text;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lost_reason_note text;

COMMENT ON COLUMN quotations.status IS
  'Draft | Pending Approval | Sent | Under Negotiation | Rejected | Ordered | Lost | Expired | Open(legacy→Sent)';

COMMENT ON COLUMN quotations.lost_reason IS
  'Fixed list: Price, Competitor, Budget, Brand Preference, Project Cancelled, Delayed Response, Customer Decision, Other';

-- Open → Sent (CRM-004). Report: SELECT count(*) FROM quotations WHERE status = 'Open' before this.
UPDATE quotations SET status = 'Sent' WHERE status = 'Open';

NOTIFY pgrst, 'reload schema';
