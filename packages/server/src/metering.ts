import { Pool } from 'pg';

interface UsageRow {
  api_key: string;
  request_count: string;
  total_usdc_received: string;
  first_request_at: Date;
  last_request_at: Date;
  updated_at: Date;
}

export interface UsageSnapshot {
  apiKey: string;
  requestCount: number;
  totalUsdcReceived: string;
  firstRequestAt: Date;
  lastRequestAt: Date;
  updatedAt: Date;
}

export interface MeterUsageInput {
  apiKey: string;
  usdcReceived?: string;
  timestamp?: Date;
}

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

const CREATE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS api_usage (
    api_key TEXT PRIMARY KEY,
    request_count BIGINT NOT NULL DEFAULT 0,
    total_usdc_received NUMERIC(20, 6) NOT NULL DEFAULT 0,
    first_request_at TIMESTAMPTZ NOT NULL,
    last_request_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const UPSERT_USAGE_SQL = `
  INSERT INTO api_usage (
    api_key,
    request_count,
    total_usdc_received,
    first_request_at,
    last_request_at,
    updated_at
  )
  VALUES ($1, 1, $2::numeric, $3, $3, NOW())
  ON CONFLICT (api_key)
  DO UPDATE
  SET
    request_count = api_usage.request_count + 1,
    total_usdc_received = api_usage.total_usdc_received + EXCLUDED.total_usdc_received,
    first_request_at = LEAST(api_usage.first_request_at, EXCLUDED.first_request_at),
    last_request_at = GREATEST(api_usage.last_request_at, EXCLUDED.last_request_at),
    updated_at = NOW()
  RETURNING api_key, request_count, total_usdc_received, first_request_at, last_request_at, updated_at;
`;

const SELECT_USAGE_SQL = `
  SELECT
    api_key,
    request_count,
    total_usdc_received,
    first_request_at,
    last_request_at,
    updated_at
  FROM api_usage
  WHERE api_key = $1;
`;

function getPool(): Pool {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for metering operations.');
  }

  pool = new Pool({ connectionString });
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(CREATE_SCHEMA_SQL)
      .then(() => undefined);
  }

  await schemaReady;
}

function mapUsageRow(row: UsageRow): UsageSnapshot {
  return {
    apiKey: row.api_key,
    requestCount: Number(row.request_count),
    totalUsdcReceived: row.total_usdc_received,
    firstRequestAt: row.first_request_at,
    lastRequestAt: row.last_request_at,
    updatedAt: row.updated_at,
  };
}

export async function meterUsage(input: MeterUsageInput): Promise<UsageSnapshot> {
  await ensureSchema();

  const recordedAt = input.timestamp ?? new Date();
  const usdcReceived = input.usdcReceived ?? '0';

  const result = await getPool().query<UsageRow>(UPSERT_USAGE_SQL, [
    input.apiKey,
    usdcReceived,
    recordedAt,
  ]);

  return mapUsageRow(result.rows[0]);
}

export async function getUsageByApiKey(apiKey: string): Promise<UsageSnapshot | null> {
  await ensureSchema();

  const result = await getPool().query<UsageRow>(SELECT_USAGE_SQL, [apiKey]);
  if (result.rowCount === 0) {
    return null;
  }

  return mapUsageRow(result.rows[0]);
}
