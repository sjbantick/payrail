import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { PaymentVerificationResult, VerifyUsdcPaymentInput } from '@payrail/gateway';
import { newDb } from 'pg-mem';
import type { Address, Hex } from 'viem';

import { createApp } from './index.js';

interface AggregateUsageRow {
  accepted_count: string;
  total_usdc_micro: string;
}

interface MeterEventEvidenceRow {
  id: string;
  request_id: string;
  total_price_usdc_micro: string;
  tx_hash: string;
}

interface SeededFixtures {
  endpointId: string;
  apiKeyId: string;
  plaintextApiKey: string;
  paymentIntentId: string;
}

const SUCCESS_TX_HASH =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
const FAILURE_TX_HASH =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex;
const USDC_CONTRACT_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCf7e' as Address;
const DEFAULT_CHAIN_ID = 8453;
const RECEIVER_WALLET = '0x2222222222222222222222222222222222222222';

function isMainModule(metaUrl: string): boolean {
  const entryPoint = process.argv[1];
  if (!entryPoint) {
    return false;
  }

  return pathToFileURL(path.resolve(entryPoint)).href === metaUrl;
}

function createMemoryPool() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const pg = db.adapters.createPg();
  return new pg.Pool();
}

function createFixtureVerifier() {
  return async (
    input: VerifyUsdcPaymentInput,
  ): Promise<PaymentVerificationResult> => {
    if (input.txHash.toLowerCase() !== SUCCESS_TX_HASH.toLowerCase()) {
      return {
        allowed: false,
        code: 'TX_NOT_FOUND',
        message: 'Transaction hash was not found on chain.',
        txHash: input.txHash,
      };
    }

    return {
      allowed: true,
      code: 'VERIFIED',
      txHash: input.txHash,
      chainId: input.expectedChainId ?? DEFAULT_CHAIN_ID,
      fromWallet: '0x1111111111111111111111111111111111111111',
      toWallet: input.expectedReceiver,
      amountUsdcMicro: input.minimumAmountUsdcMicro + 1_000n,
      confirmations: 3,
      blockNumber: 102n,
      verifiedAt: new Date('2026-03-05T00:00:00.000Z'),
    };
  };
}

function hashApiKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function ensureSchemaInitialized(app: ReturnType<typeof createApp>): Promise<void> {
  const response = await app.request('/v1/verify-and-meter', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      endpointId: randomUUID(),
      requestId: `schema-bootstrap-${Date.now()}`,
      payment: {
        txHash: SUCCESS_TX_HASH,
        chainId: DEFAULT_CHAIN_ID,
        token: 'USDC',
      },
      usage: {
        units: 1,
      },
    }),
  });

  // Unknown endpoint is expected on bootstrap; anything else means schema path is broken.
  assert.ok(
    [400, 402, 200].includes(response.status),
    `Unexpected schema bootstrap status: ${response.status}`,
  );
}

async function hasColumn(
  pool: ReturnType<typeof createMemoryPool>,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const result = await pool.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [tableName, columnName],
  );

  return result.rowCount > 0;
}

async function hasTable(pool: ReturnType<typeof createMemoryPool>, tableName: string): Promise<boolean> {
  const result = await pool.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
      LIMIT 1
    `,
    [tableName],
  );

  return result.rowCount > 0;
}

async function seedFixtures(pool: ReturnType<typeof createMemoryPool>): Promise<SeededFixtures> {
  const endpointId = randomUUID();
  const apiKeyId = randomUUID();
  const paymentIntentId = randomUUID();
  const plaintextApiKey = 'payrail_dev_demo_first_payment';

  const hasDeveloperIdColumn = await hasColumn(pool, 'api_endpoints', 'developer_id');

  if (hasDeveloperIdColumn) {
    const developerId = randomUUID();

    await pool.query(
      `
        INSERT INTO developers (
          id,
          name,
          email,
          default_payout_wallet
        )
        VALUES ($1, $2, $3, $4)
      `,
      [developerId, 'PayRail Demo Developer', 'demo@payrail.dev', RECEIVER_WALLET],
    );

    await pool.query(
      `
        INSERT INTO api_endpoints (
          id,
          developer_id,
          slug,
          upstream_url,
          price_per_call_usdc_micro,
          receiver_wallet
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        endpointId,
        developerId,
        `demo-first-paid-request-${endpointId.slice(0, 8)}`,
        'https://api.example.com/v1/paid/forecast',
        '1000',
        RECEIVER_WALLET,
      ],
    );

    if (await hasTable(pool, 'api_keys')) {
      await pool.query(
        `
          INSERT INTO api_keys (
            id,
            developer_id,
            key_hash,
            label
          )
          VALUES ($1, $2, $3, $4)
        `,
        [apiKeyId, developerId, hashApiKey(plaintextApiKey), 'Default dev key'],
      );
    }

    if (await hasTable(pool, 'payment_intents')) {
      await pool.query(
        `
          INSERT INTO payment_intents (
            id,
            endpoint_id,
            idempotency_key,
            required_amount_usdc_micro,
            status,
            expires_at
          )
          VALUES ($1, $2, $3, $4, 'pending', $5)
        `,
        [
          paymentIntentId,
          endpointId,
          `seed-${endpointId.slice(0, 8)}`,
          '1000',
          new Date(Date.now() + 60 * 60 * 1000),
        ],
      );
    }
  } else {
    await pool.query(
      `
        INSERT INTO api_endpoints (
          id,
          price_per_call_usdc_micro,
          receiver_wallet
        )
        VALUES ($1, $2, $3)
      `,
      [endpointId, '1000', RECEIVER_WALLET],
    );
  }

  return {
    endpointId,
    apiKeyId,
    plaintextApiKey,
    paymentIntentId,
  };
}

async function runDemo(): Promise<void> {
  const pool = createMemoryPool();

  try {
    const app = createApp({
      pool,
      verifyPayment: createFixtureVerifier(),
      usdcContractAddress: USDC_CONTRACT_ADDRESS,
      minimumConfirmations: 1,
    });

    await ensureSchemaInitialized(app);
    const fixtures = await seedFixtures(pool);

    const successResponse = await app.request('/v1/verify-and-meter', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        endpointId: fixtures.endpointId,
        requestId: 'req_demo_success_1',
        idempotencyKey: 'idem_demo_success_1',
        payment: {
          txHash: SUCCESS_TX_HASH,
          chainId: DEFAULT_CHAIN_ID,
          token: 'USDC',
        },
        usage: {
          units: 1,
        },
      }),
    });

    const successBody = (await successResponse.json()) as Record<string, unknown>;
    assert.equal(successResponse.status, 200);
    assert.equal(successBody.allowed, true);
    assert.equal(typeof successBody.meterEventId, 'string');
    assert.equal(typeof successBody.paymentTxHash, 'string');

    const failureResponse = await app.request('/v1/verify-and-meter', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        endpointId: fixtures.endpointId,
        requestId: 'req_demo_failure_1',
        idempotencyKey: 'idem_demo_failure_1',
        payment: {
          txHash: FAILURE_TX_HASH,
          chainId: DEFAULT_CHAIN_ID,
          token: 'USDC',
        },
        usage: {
          units: 1,
        },
      }),
    });

    const failureBody = (await failureResponse.json()) as Record<string, unknown>;
    assert.equal(failureResponse.status, 402);
    assert.equal(failureBody.allowed, false);

    const usageAggregateResult = await pool.query(
      `
        SELECT
          COUNT(*)::text AS accepted_count,
          COALESCE(SUM(total_price_usdc_micro), 0)::text AS total_usdc_micro
        FROM meter_events
        WHERE endpoint_id = $1
          AND status = 'accepted'
      `,
      [fixtures.endpointId],
    );
    const usageAggregate = usageAggregateResult.rows as AggregateUsageRow[];

    const meterEventId = String(successBody.meterEventId);
    const evidenceQueryResult = await pool.query(
      `
        SELECT
          me.id,
          me.request_id,
          me.total_price_usdc_micro::text AS total_price_usdc_micro,
          pt.tx_hash
        FROM meter_events me
        LEFT JOIN payment_transactions pt
          ON pt.id = me.payment_transaction_id
        WHERE me.id = $1
      `,
      [meterEventId],
    );
    const evidenceResult = evidenceQueryResult.rows as MeterEventEvidenceRow[];

    const aggregateRow = usageAggregate[0];
    const evidenceRow = evidenceResult[0];

    assert.ok(aggregateRow, 'Expected aggregate usage evidence row.');
    assert.ok(evidenceRow, 'Expected meter event evidence row.');
    assert.equal(aggregateRow.accepted_count, '1');
    assert.equal(aggregateRow.total_usdc_micro, '1000');
    assert.equal(evidenceRow.id, meterEventId);

    console.log('== PAY-19 Demo: First Paid Request ==');
    console.log(`Seeded endpointId: ${fixtures.endpointId}`);
    console.log(`Seeded apiKeyId: ${fixtures.apiKeyId}`);
    console.log(`Seeded plaintextApiKey: ${fixtures.plaintextApiKey}`);
    console.log(`Seeded paymentIntentId: ${fixtures.paymentIntentId}`);
    console.log(`Success status: ${successResponse.status}`);
    console.log(`Success meterEventId: ${meterEventId}`);
    console.log(`Success paymentTxHash: ${String(successBody.paymentTxHash)}`);
    console.log(`Failure status: ${failureResponse.status}`);
    console.log(`Failure code: ${String(failureBody.code)}`);
    console.log(`Usage evidence acceptedEvents: ${aggregateRow.accepted_count}`);
    console.log(`Usage evidence totalChargedUsdcMicro: ${aggregateRow.total_usdc_micro}`);
    console.log(`Usage evidence requestId: ${evidenceRow.request_id}`);
    console.log(`Usage evidence meterEventTxHash: ${evidenceRow.tx_hash}`);
  } finally {
    await pool.end();
  }
}

if (isMainModule(import.meta.url)) {
  runDemo().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`PAY-19 demo failed: ${message}`);
    process.exitCode = 1;
  });
}
