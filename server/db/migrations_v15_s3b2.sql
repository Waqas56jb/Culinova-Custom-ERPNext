-- Sprint 3 Block 2 — credit override requests (Rules §8: max 3 active quotes when overdue)
-- Invoices already have due_date / total / paid — no invoice schema change.

CREATE TABLE IF NOT EXISTS credit_override_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer text NOT NULL,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Pending',
  -- Pending | Approved | Rejected | Consumed
  overdue_amount numeric DEFAULT 0,
  active_quotations_count integer DEFAULT 0,
  note text,
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_override_customer_status
  ON credit_override_requests (customer, status);

COMMENT ON TABLE credit_override_requests IS
  'S3B2: Management approval to create a 4th+ active quotation for a customer with overdue balance';

NOTIFY pgrst, 'reload schema';
