ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS settled_batch_id UUID REFERENCES settlement_batches(id) ON DELETE SET NULL;

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_settled_batch_id
  ON payment_transactions(settled_batch_id);
