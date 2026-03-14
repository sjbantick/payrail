-- M2: attribute usage to API keys
ALTER TABLE meter_events ADD COLUMN IF NOT EXISTS api_key TEXT;

-- Efficient per-key usage queries
CREATE INDEX IF NOT EXISTS idx_meter_events_api_key ON meter_events(api_key);

-- Allow admin-created endpoints without a developer record
ALTER TABLE api_endpoints ALTER COLUMN developer_id DROP NOT NULL;
