CREATE TABLE IF NOT EXISTS developers (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  default_payout_wallet TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_endpoints (
  id UUID PRIMARY KEY,
  developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  upstream_url TEXT NOT NULL,
  price_per_call_usdc_micro BIGINT NOT NULL,
  receiver_wallet TEXT NOT NULL,
  auth_mode TEXT NOT NULL DEFAULT 'api_key',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY,
  developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY,
  endpoint_id UUID NOT NULL REFERENCES api_endpoints(id) ON DELETE CASCADE,
  idempotency_key TEXT,
  required_amount_usdc_micro BIGINT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'expired', 'failed')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(endpoint_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY,
  payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE SET NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  chain_id BIGINT NOT NULL,
  token_contract TEXT NOT NULL,
  from_wallet TEXT NOT NULL,
  to_wallet TEXT NOT NULL,
  amount_usdc_micro BIGINT NOT NULL,
  block_number BIGINT NOT NULL,
  confirmations INTEGER NOT NULL,
  verified_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('observed', 'verified', 'rejected')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meter_events (
  id UUID PRIMARY KEY,
  endpoint_id UUID NOT NULL REFERENCES api_endpoints(id) ON DELETE CASCADE,
  payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE SET NULL,
  payment_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE SET NULL,
  request_id TEXT NOT NULL,
  client_id TEXT,
  units BIGINT NOT NULL DEFAULT 1,
  unit_price_usdc_micro BIGINT NOT NULL,
  total_price_usdc_micro BIGINT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected', 'error')),
  reject_code TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(endpoint_id, request_id)
);

CREATE TABLE IF NOT EXISTS settlement_batches (
  id UUID PRIMARY KEY,
  from_ts TIMESTAMPTZ NOT NULL,
  to_ts TIMESTAMPTZ NOT NULL,
  gross_usdc_micro BIGINT NOT NULL,
  fee_usdc_micro BIGINT NOT NULL,
  net_usdc_micro BIGINT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'queued', 'submitted', 'confirmed', 'failed')),
  submit_tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS settlement_items (
  id UUID PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES settlement_batches(id) ON DELETE CASCADE,
  developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  amount_usdc_micro BIGINT NOT NULL,
  destination_wallet TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'submitted', 'confirmed', 'failed')),
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(batch_id, developer_id)
);

CREATE INDEX IF NOT EXISTS idx_api_endpoints_developer_id ON api_endpoints(developer_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_developer_id ON api_keys(developer_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_endpoint_id ON payment_intents(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_meter_events_endpoint_created_at ON meter_events(endpoint_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_tx_chain_block ON payment_transactions(chain_id, block_number DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_batches_status ON settlement_batches(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_items_batch_id ON settlement_items(batch_id);
