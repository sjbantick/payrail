import { randomUUID } from 'node:crypto';

import {
  verifyUsdcPayment,
  type PaymentVerificationFailure,
  type PaymentVerificationResult,
  type VerifyUsdcPaymentInput,
  type VerifyUsdcPaymentOptions,
} from '@payrail/gateway';
import type { Context } from 'hono';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import type { Address, Hex } from 'viem';
import { z } from 'zod';

const verifyAndMeterRequestSchema = z.object({
  endpointId: z.string().min(1),
  requestId: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
  payment: z.object({
    txHash: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/),
    chainId: z.number().int().positive(),
    token: z.string().min(1),
  }),
  usage: z
    .object({
      units: z.number().int().positive().default(1),
    })
    .default({ units: 1 }),
  context: z
    .object({
      method: z.string().optional(),
      path: z.string().optional(),
      clientIp: z.string().optional(),
      userAgent: z.string().optional(),
    })
    .optional(),
});

type VerifyAndMeterRequest = z.infer<typeof verifyAndMeterRequestSchema>;

interface EndpointPricingRow {
  id: string;
  price_per_call_usdc_micro: string;
  receiver_wallet: string;
}

interface ExistingMeterEventRow {
  id: string;
  status: 'accepted' | 'rejected' | 'error';
  reject_code: string | null;
  total_price_usdc_micro: string;
  tx_hash: string | null;
}

interface PaymentTransactionRow {
  id: string;
  tx_hash: string;
}

interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

interface QueryablePool extends Queryable {
  connect(): Promise<PoolClient>;
}

export interface VerifyAndMeterDependencies {
  pool?: QueryablePool;
  verifyPayment?: (
    input: VerifyUsdcPaymentInput,
    options?: VerifyUsdcPaymentOptions,
  ) => Promise<PaymentVerificationResult>;
  usdcContractAddress?: string;
  minimumConfirmations?: number;
}

export interface VerifyAndMeterSuccessResponse {
  allowed: true;
  meterEventId: string;
  chargedUsdcMicro: number | string;
  paymentTxHash: string;
}

export interface VerifyAndMeterFailureResponse {
  allowed: false;
  code: 'PAYMENT_REQUIRED' | 'PAYMENT_ALREADY_USED';
  message: string;
  requiredUsdcMicro: number | string;
  details: {
    chainId: number;
    receiver: string;
    reason: string;
  };
}

const CREATE_VERIFY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS api_endpoints (
    id TEXT PRIMARY KEY,
    price_per_call_usdc_micro BIGINT NOT NULL,
    receiver_wallet TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS payment_transactions (
    id TEXT PRIMARY KEY,
    tx_hash TEXT NOT NULL UNIQUE,
    chain_id BIGINT NOT NULL,
    token_contract TEXT NOT NULL,
    from_wallet TEXT NOT NULL,
    to_wallet TEXT NOT NULL,
    amount_usdc_micro BIGINT NOT NULL,
    block_number BIGINT NOT NULL,
    confirmations INTEGER NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('observed', 'verified', 'rejected')),
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS meter_events (
    id TEXT PRIMARY KEY,
    endpoint_id TEXT NOT NULL,
    payment_transaction_id TEXT REFERENCES payment_transactions(id),
    request_id TEXT NOT NULL,
    units BIGINT NOT NULL DEFAULT 1,
    unit_price_usdc_micro BIGINT NOT NULL,
    total_price_usdc_micro BIGINT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected', 'error')),
    reject_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(endpoint_id, request_id)
  );

  CREATE INDEX IF NOT EXISTS idx_payment_transactions_tx_hash ON payment_transactions(tx_hash);
  CREATE INDEX IF NOT EXISTS idx_meter_events_endpoint_request ON meter_events(endpoint_id, request_id);
`;

const SELECT_ENDPOINT_SQL = `
  SELECT id, price_per_call_usdc_micro, receiver_wallet
  FROM api_endpoints
  WHERE id = $1
`;

const SELECT_EXISTING_EVENT_SQL = `
  SELECT
    me.id,
    me.status,
    me.reject_code,
    me.total_price_usdc_micro,
    pt.tx_hash
  FROM meter_events me
  LEFT JOIN payment_transactions pt ON pt.id = me.payment_transaction_id
  WHERE me.endpoint_id = $1 AND me.request_id = $2
  LIMIT 1
`;

const INSERT_PAYMENT_TRANSACTION_SQL = `
  INSERT INTO payment_transactions (
    id,
    tx_hash,
    chain_id,
    token_contract,
    from_wallet,
    to_wallet,
    amount_usdc_micro,
    block_number,
    confirmations,
    verified_at,
    status,
    rejection_reason
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'verified', NULL)
  ON CONFLICT (tx_hash) DO NOTHING
  RETURNING id, tx_hash
`;

const SELECT_PAYMENT_TRANSACTION_BY_HASH_SQL = `
  SELECT id, tx_hash
  FROM payment_transactions
  WHERE tx_hash = $1
  LIMIT 1
`;

const SELECT_METER_EVENT_BY_PAYMENT_TX_SQL = `
  SELECT endpoint_id, request_id
  FROM meter_events
  WHERE payment_transaction_id = $1
  LIMIT 1
`;

const INSERT_METER_EVENT_SQL = `
  INSERT INTO meter_events (
    id,
    endpoint_id,
    payment_transaction_id,
    request_id,
    units,
    unit_price_usdc_micro,
    total_price_usdc_micro,
    status,
    reject_code
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, 'accepted', NULL)
  ON CONFLICT (endpoint_id, request_id) DO NOTHING
  RETURNING id
`;

let defaultPool: Pool | null = null;
const verifySchemaReady = new WeakMap<object, Promise<void>>();

function getDefaultPool(): QueryablePool {
  if (defaultPool) {
    return defaultPool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for verify-and-meter operations.');
  }

  defaultPool = new Pool({ connectionString });
  return defaultPool;
}

function getPool(pool?: QueryablePool): QueryablePool {
  if (pool) {
    return pool;
  }

  return getDefaultPool();
}

function serializeMicroAmount(value: bigint): number | string {
  if (value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }

  return value.toString();
}

function parseMicroAmount(value: string): bigint {
  return BigInt(value);
}

function paymentRequiredResponse(params: {
  requiredUsdcMicro: bigint;
  chainId: number;
  receiver: string;
  reason: string;
  message?: string;
  code?: 'PAYMENT_REQUIRED' | 'PAYMENT_ALREADY_USED';
}): VerifyAndMeterFailureResponse {
  return {
    allowed: false,
    code: params.code ?? 'PAYMENT_REQUIRED',
    message: params.message ?? 'Valid USDC payment not found for this request',
    requiredUsdcMicro: serializeMicroAmount(params.requiredUsdcMicro),
    details: {
      chainId: params.chainId,
      receiver: params.receiver,
      reason: params.reason,
    },
  };
}

function successResponse(params: {
  meterEventId: string;
  chargedUsdcMicro: bigint;
  paymentTxHash: string;
}): VerifyAndMeterSuccessResponse {
  return {
    allowed: true,
    meterEventId: params.meterEventId,
    chargedUsdcMicro: serializeMicroAmount(params.chargedUsdcMicro),
    paymentTxHash: params.paymentTxHash,
  };
}

function mapExistingEvent(
  event: ExistingMeterEventRow,
  fallbackTxHash: string,
  chainId: number,
  receiver: string,
): VerifyAndMeterSuccessResponse | VerifyAndMeterFailureResponse {
  const chargedUsdcMicro = parseMicroAmount(event.total_price_usdc_micro);

  if (event.status === 'accepted') {
    return successResponse({
      meterEventId: event.id,
      chargedUsdcMicro,
      paymentTxHash: event.tx_hash ?? fallbackTxHash,
    });
  }

  return paymentRequiredResponse({
    requiredUsdcMicro: chargedUsdcMicro,
    chainId,
    receiver,
    reason: event.reject_code ?? 'PAYMENT_REQUIRED',
  });
}

function parseRequestBody(payload: unknown): VerifyAndMeterRequest {
  const parsed = verifyAndMeterRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw parsed.error;
  }

  return parsed.data;
}

export async function ensureVerifyAndMeterSchema(pool?: QueryablePool): Promise<void> {
  const resolvedPool = getPool(pool);
  const cacheKey = resolvedPool as object;
  const cached = verifySchemaReady.get(cacheKey);
  if (cached) {
    await cached;
    return;
  }

  const readyPromise = resolvedPool.query(CREATE_VERIFY_SCHEMA_SQL).then(() => undefined);
  verifySchemaReady.set(cacheKey, readyPromise);

  await readyPromise;
}

async function getEndpointPricing(pool: Queryable, endpointId: string): Promise<EndpointPricingRow | null> {
  const result = await pool.query<EndpointPricingRow>(SELECT_ENDPOINT_SQL, [endpointId]);
  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}

async function getExistingMeterEvent(
  pool: Queryable,
  endpointId: string,
  requestId: string,
): Promise<ExistingMeterEventRow | null> {
  const result = await pool.query<ExistingMeterEventRow>(SELECT_EXISTING_EVENT_SQL, [endpointId, requestId]);
  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}

async function persistVerifiedCharge(params: {
  pool: QueryablePool;
  endpointId: string;
  requestId: string;
  units: number;
  unitPriceUsdcMicro: bigint;
  totalPriceUsdcMicro: bigint;
  chainId: number;
  tokenContract: string;
  verification: Extract<PaymentVerificationResult, { allowed: true }>;
}): Promise<VerifyAndMeterSuccessResponse | VerifyAndMeterFailureResponse> {
  const client = await params.pool.connect();
  try {
    await client.query('BEGIN');

    const existingInTxn = await getExistingMeterEvent(client, params.endpointId, params.requestId);
    if (existingInTxn) {
      const replayResponse = mapExistingEvent(
        existingInTxn,
        params.verification.txHash,
        params.chainId,
        params.verification.toWallet,
      );
      await client.query('COMMIT');
      return replayResponse;
    }

    const insertPayment = await client.query<PaymentTransactionRow>(INSERT_PAYMENT_TRANSACTION_SQL, [
      randomUUID(),
      params.verification.txHash,
      params.chainId,
      params.tokenContract,
      params.verification.fromWallet,
      params.verification.toWallet,
      params.verification.amountUsdcMicro.toString(),
      params.verification.blockNumber.toString(),
      params.verification.confirmations,
      params.verification.verifiedAt,
    ]);

    let paymentTransactionId = insertPayment.rows[0]?.id;

    if (!paymentTransactionId) {
      const existingPayment = await client.query<PaymentTransactionRow>(
        SELECT_PAYMENT_TRANSACTION_BY_HASH_SQL,
        [params.verification.txHash],
      );

      const existingPaymentRow = existingPayment.rows[0];
      if (!existingPaymentRow) {
        throw new Error('Payment transaction conflict detected but no existing row was found.');
      }

      const existingUsage = await client.query<{ endpoint_id: string; request_id: string }>(
        SELECT_METER_EVENT_BY_PAYMENT_TX_SQL,
        [existingPaymentRow.id],
      );

      if (existingUsage.rowCount && existingUsage.rows[0].request_id !== params.requestId) {
        await client.query('COMMIT');
        return paymentRequiredResponse({
          code: 'PAYMENT_ALREADY_USED',
          message: 'Transaction hash has already been used for another request',
          requiredUsdcMicro: params.totalPriceUsdcMicro,
          chainId: params.chainId,
          receiver: params.verification.toWallet,
          reason: 'TX_ALREADY_SPENT',
        });
      }

      paymentTransactionId = existingPaymentRow.id;
    }

    const insertedEvent = await client.query<{ id: string }>(INSERT_METER_EVENT_SQL, [
      randomUUID(),
      params.endpointId,
      paymentTransactionId,
      params.requestId,
      params.units,
      params.unitPriceUsdcMicro.toString(),
      params.totalPriceUsdcMicro.toString(),
    ]);

    if (insertedEvent.rowCount === 0) {
      const existingEvent = await getExistingMeterEvent(client, params.endpointId, params.requestId);
      if (!existingEvent) {
        throw new Error('Meter event conflict detected but no existing row was found.');
      }

      const replayResponse = mapExistingEvent(
        existingEvent,
        params.verification.txHash,
        params.chainId,
        params.verification.toWallet,
      );
      await client.query('COMMIT');
      return replayResponse;
    }

    await client.query('COMMIT');

    return successResponse({
      meterEventId: insertedEvent.rows[0].id,
      chargedUsdcMicro: params.totalPriceUsdcMicro,
      paymentTxHash: params.verification.txHash,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function mapVerificationFailure(params: {
  failure: PaymentVerificationFailure;
  requiredUsdcMicro: bigint;
  chainId: number;
  receiver: string;
}): VerifyAndMeterFailureResponse {
  return paymentRequiredResponse({
    requiredUsdcMicro: params.requiredUsdcMicro,
    chainId: params.chainId,
    receiver: params.receiver,
    reason: params.failure.code,
    message: params.failure.message,
  });
}

export function createVerifyAndMeterHandler(dependencies: VerifyAndMeterDependencies = {}) {
  const verifier = dependencies.verifyPayment ?? verifyUsdcPayment;

  return async (c: Context) => {
    let payload: VerifyAndMeterRequest;
    try {
      const requestBody = await c.req.json();
      payload = parseRequestBody(requestBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json(
          {
            error: 'Invalid request payload',
            details: error.flatten(),
          },
          400,
        );
      }

      return c.json(
        {
          error: 'Invalid JSON body',
        },
        400,
      );
    }

    if (payload.payment.token.toUpperCase() !== 'USDC') {
      return c.json(
        paymentRequiredResponse({
          requiredUsdcMicro: 0n,
          chainId: payload.payment.chainId,
          receiver: 'unknown',
          reason: 'UNSUPPORTED_TOKEN',
          message: 'Only USDC payments are supported for verify-and-meter',
        }),
        402,
      );
    }

    const pool = getPool(dependencies.pool);
    await ensureVerifyAndMeterSchema(pool);

    const endpoint = await getEndpointPricing(pool, payload.endpointId);
    if (!endpoint) {
      return c.json(
        {
          error: 'Unknown endpointId',
          endpointId: payload.endpointId,
        },
        400,
      );
    }

    const unitPriceUsdcMicro = parseMicroAmount(endpoint.price_per_call_usdc_micro);
    const units = payload.usage.units;
    const requiredUsdcMicro = unitPriceUsdcMicro * BigInt(units);

    const existingEvent = await getExistingMeterEvent(pool, payload.endpointId, payload.requestId);
    if (existingEvent) {
      return c.json(
        mapExistingEvent(existingEvent, payload.payment.txHash, payload.payment.chainId, endpoint.receiver_wallet),
        existingEvent.status === 'accepted' ? 200 : 402,
      );
    }

    const usdcContractAddress = dependencies.usdcContractAddress ?? process.env.USDC_CONTRACT_ADDRESS;
    if (!usdcContractAddress) {
      return c.json(
        {
          error: 'USDC_CONTRACT_ADDRESS is required',
        },
        500,
      );
    }

    const verification = await verifier(
      {
        txHash: payload.payment.txHash as Hex,
        expectedReceiver: endpoint.receiver_wallet as Address,
        usdcContract: usdcContractAddress as Address,
        minimumAmountUsdcMicro: requiredUsdcMicro,
        expectedChainId: payload.payment.chainId,
        minimumConfirmations: dependencies.minimumConfirmations ?? 1,
      },
      {
        markSpentOnSuccess: false,
      },
    );

    if (!verification.allowed) {
      return c.json(
        mapVerificationFailure({
          failure: verification,
          requiredUsdcMicro,
          chainId: payload.payment.chainId,
          receiver: endpoint.receiver_wallet,
        }),
        402,
      );
    }

    try {
      const result = await persistVerifiedCharge({
        pool,
        endpointId: payload.endpointId,
        requestId: payload.requestId,
        units,
        unitPriceUsdcMicro,
        totalPriceUsdcMicro: requiredUsdcMicro,
        chainId: payload.payment.chainId,
        tokenContract: usdcContractAddress,
        verification,
      });

      return c.json(result, result.allowed ? 200 : 402);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return c.json(
        {
          error: 'Failed to verify and meter request',
          message,
        },
        500,
      );
    }
  };
}
