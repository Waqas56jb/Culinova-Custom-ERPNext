-- Sprint 1b Block 2 — Valuation Rate approval workflow (Ali §3)
CREATE TABLE IF NOT EXISTS vr_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  item_name text,
  old_value numeric,
  new_value numeric NOT NULL,
  status text NOT NULL DEFAULT 'Pending',
  reason text,
  requested_by text,
  requested_by_id uuid,
  requested_at timestamptz DEFAULT now(),
  decided_by text,
  decided_by_id uuid,
  decided_at timestamptz,
  decision_note text
);

CREATE INDEX IF NOT EXISTS vr_change_requests_item_status_idx
  ON vr_change_requests (item_id, status);

-- Optional note on pricing history (requester → approver line for approved-request)
ALTER TABLE item_pricing_history ADD COLUMN IF NOT EXISTS note text;
