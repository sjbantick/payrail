import assert from 'node:assert/strict';
import test from 'node:test';

import type { PaymentVerificationResult } from '@payrail/gateway';
import { newDb } from 'pg-mem';

import { createApp } from './index.js';
import { ensureVerifyAndMeterSchema } from './verify-and-meter.js';

const endpointId = 'ep_123';
const requestId = 'req_123';
const txHash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const usdcContract = '0x036CbD53842c5426634e7929541eC2318f3dCf7e';
const receiverWallet = '0x2222222222222222222222222222222222222222';
const senderWallet = '0x1111111111111111111111111111111111111111';

function createMemoryPool() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const pg = db.adapters.createPg();

  return new pg.Pool();
}

async function seedEndpoint(pool: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
  await ensureVerifyAndMeterSchema(pool as never);
  await pool.query(
    `
      INSERT INTO api_endpoints (id, price_per_call_usdc_micro, receiver_wallet)
      VALUES ($1, $2, $3)
    `,
    [endpointId, '1000', receiverWallet],
  );
}

function buildPayload(overrides?: Partial<Record<string, unknown>>) {
  const base = {
    endpointId,
    requestId,
    idempotencyKey: 'idem_123',
    payment: {
      txHash,
      chainId: 8453,
      token: 'USDC',
    },
    usage: {
      units: 1,
    },
    context: {
      method: 'POST',
      path: '/v1/paid/run',
      clientIp: '127.0.0.1',
      userAgent: 'node-test',
    },
  };

  return {
    ...base,
    ...overrides,
  };
}

function verifiedResult(): PaymentVerificationResult {
  return {
    allowed: true,
    code: 'VERIFIED',
    txHash,
    chainId: 8453,
    fromWallet: senderWallet,
    toWallet: receiverWallet,
    amountUsdcMicro: 2000n,
    confirmations: 3,
    blockNumber: 102n,
    verifiedAt: new Date('2026-03-05T00:00:00.000Z'),
  };
}

test('POST /v1/verify-and-meter returns 200 and persists tx + meter event for valid payment', async () => {
  const pool = createMemoryPool();
  await seedEndpoint(pool);

  const app = createApp({
    pool: pool as never,
    verifyPayment: async () => verifiedResult(),
    usdcContractAddress: usdcContract,
  });

  const response = await app.request('/v1/verify-and-meter', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildPayload()),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.chargedUsdcMicro, 1000);
  assert.equal(body.paymentTxHash, txHash);

  const txCount = await pool.query('SELECT COUNT(*) AS count FROM payment_transactions');
  const meterCount = await pool.query('SELECT COUNT(*) AS count FROM meter_events');

  assert.equal(txCount.rows[0]?.count, 1);
  assert.equal(meterCount.rows[0]?.count, 1);

  await pool.end();
});

test('POST /v1/verify-and-meter returns 402 when tx is invalid', async () => {
  const pool = createMemoryPool();
  await seedEndpoint(pool);

  const app = createApp({
    pool: pool as never,
    verifyPayment: async () => ({
      allowed: false,
      code: 'TX_NOT_FOUND',
      message: 'Transaction hash was not found on chain.',
      txHash,
    }),
    usdcContractAddress: usdcContract,
  });

  const response = await app.request('/v1/verify-and-meter', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildPayload()),
  });

  assert.equal(response.status, 402);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.code, 'PAYMENT_REQUIRED');
  assert.equal(body.details.reason, 'TX_NOT_FOUND');

  await pool.end();
});

test('POST /v1/verify-and-meter returns 402 when tx amount is insufficient', async () => {
  const pool = createMemoryPool();
  await seedEndpoint(pool);

  const app = createApp({
    pool: pool as never,
    verifyPayment: async () => ({
      allowed: false,
      code: 'INSUFFICIENT_AMOUNT',
      message: 'USDC transfer amount is below required price.',
      txHash,
      details: {
        requiredAmountUsdcMicro: '1000',
        observedAmountUsdcMicro: '100',
      },
    }),
    usdcContractAddress: usdcContract,
  });

  const response = await app.request('/v1/verify-and-meter', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildPayload()),
  });

  assert.equal(response.status, 402);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.details.reason, 'INSUFFICIENT_AMOUNT');
  assert.equal(body.requiredUsdcMicro, 1000);

  await pool.end();
});

test('POST /v1/verify-and-meter returns same 200 response for idempotent retry', async () => {
  const pool = createMemoryPool();
  await seedEndpoint(pool);

  let verifyInvocations = 0;
  const app = createApp({
    pool: pool as never,
    verifyPayment: async () => {
      verifyInvocations += 1;
      return verifiedResult();
    },
    usdcContractAddress: usdcContract,
  });

  const first = await app.request('/v1/verify-and-meter', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildPayload()),
  });
  const firstBody = await first.json();

  const second = await app.request('/v1/verify-and-meter', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildPayload()),
  });
  const secondBody = await second.json();

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(secondBody.meterEventId, firstBody.meterEventId);
  assert.equal(secondBody.paymentTxHash, firstBody.paymentTxHash);
  assert.equal(verifyInvocations, 1);

  await pool.end();
});

test('POST /v1/verify-and-meter returns 402 when chainId mismatches', async () => {
  const pool = createMemoryPool();
  await seedEndpoint(pool);

  const app = createApp({
    pool: pool as never,
    verifyPayment: async () => ({
      allowed: false,
      code: 'CHAIN_MISMATCH',
      message: 'Transaction was submitted to a different chain.',
      txHash,
      details: {
        expectedChainId: 8453,
        observedChainId: 84532,
      },
    }),
    usdcContractAddress: usdcContract,
  });

  const response = await app.request('/v1/verify-and-meter', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildPayload()),
  });

  assert.equal(response.status, 402);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.details.reason, 'CHAIN_MISMATCH');
  assert.equal(body.details.chainId, 8453);

  await pool.end();
});
