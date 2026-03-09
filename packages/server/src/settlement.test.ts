import assert from 'node:assert/strict';
import test from 'node:test';

import { newDb } from 'pg-mem';

import { createApiEndpoint, createDeveloper, createMeterEvent, createPaymentTransaction } from './db/models.js';
import { runMigrations } from './db/migrate.js';
import { runSettlementCycle } from './settlement.js';

function createMemoryPool() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const pg = db.adapters.createPg();

  return new pg.Pool();
}

const developerId = '11111111-1111-4111-8111-111111111111';
const endpointId = '22222222-2222-4222-8222-222222222222';
const paymentTransactionId = '33333333-3333-4333-8333-333333333333';
const receiverWallet = '0x2222222222222222222222222222222222222222';

async function seedAcceptedMeterEvent(pool: ReturnType<typeof createMemoryPool>) {
  await runMigrations({ pool });

  await createDeveloper(pool as never, {
    id: developerId,
    name: 'Settlement Test Developer',
    defaultPayoutWallet: receiverWallet,
  });

  await createApiEndpoint(pool as never, {
    id: endpointId,
    developerId,
    slug: 'settlement-endpoint',
    upstreamUrl: 'https://example.com/paid',
    pricePerCallUsdcMicro: 1000n,
    receiverWallet,
  });

  await createPaymentTransaction(pool as never, {
    id: paymentTransactionId,
    txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    chainId: 8453n,
    tokenContract: '0x036CbD53842c5426634e7929541eC2318f3dCf7e',
    fromWallet: '0x1111111111111111111111111111111111111111',
    toWallet: receiverWallet,
    amountUsdcMicro: 1000n,
    blockNumber: 10n,
    confirmations: 2,
    status: 'verified',
    verifiedAt: new Date('2026-03-05T00:00:00.000Z'),
  });

  await createMeterEvent(pool as never, {
    id: '44444444-4444-4444-8444-444444444444',
    endpointId,
    paymentTransactionId,
    requestId: 'req-settle-1',
    units: 1n,
    unitPriceUsdcMicro: 1000n,
    totalPriceUsdcMicro: 1000n,
    status: 'accepted',
  });
}

test('runSettlementCycle creates confirmed batch and marks transactions settled', async () => {
  const pool = createMemoryPool();
  await seedAcceptedMeterEvent(pool);

  const summary = await runSettlementCycle({
    pool: pool as never,
    now: new Date(Date.now() + 2 * 60 * 60 * 1000),
    payout: async () => ({
      txHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    }),
  });

  assert.equal(typeof summary.batchId, 'string');
  assert.equal(summary.failedDevelopers, 0);
  assert.equal(summary.processedDevelopers, 1);
  assert.equal(summary.totalGrossUsdcMicro, '1000');
  assert.equal(summary.totalFeeUsdcMicro, '15');
  assert.equal(summary.totalNetUsdcMicro, '985');

  const batchRow = await pool.query(
    `
      SELECT status
      FROM settlement_batches
      WHERE id = $1
    `,
    [summary.batchId],
  );
  assert.equal(batchRow.rows[0]?.status, 'confirmed');

  const itemRow = await pool.query(
    `
      SELECT status, amount_usdc_micro
      FROM settlement_items
      WHERE batch_id = $1
    `,
    [summary.batchId],
  );
  assert.equal(itemRow.rows[0]?.status, 'confirmed');
  assert.equal(String(itemRow.rows[0]?.amount_usdc_micro), '985');

  const txRow = await pool.query(
    `
      SELECT settled_batch_id, settled_at
      FROM payment_transactions
      WHERE id = $1
    `,
    [paymentTransactionId],
  );
  assert.equal(txRow.rows[0]?.settled_batch_id, summary.batchId);
  assert.equal(Boolean(txRow.rows[0]?.settled_at), true);

  await pool.end();
});

test('runSettlementCycle marks batch failed and releases claims when payout fails', async () => {
  const pool = createMemoryPool();
  await seedAcceptedMeterEvent(pool);

  const summary = await runSettlementCycle({
    pool: pool as never,
    now: new Date(Date.now() + 2 * 60 * 60 * 1000),
    payout: async () => {
      throw new Error('payout failure');
    },
  });

  assert.equal(typeof summary.batchId, 'string');
  assert.equal(summary.failedDevelopers, 1);

  const batchRow = await pool.query(
    `
      SELECT status
      FROM settlement_batches
      WHERE id = $1
    `,
    [summary.batchId],
  );
  assert.equal(batchRow.rows[0]?.status, 'failed');

  const itemRow = await pool.query(
    `
      SELECT status
      FROM settlement_items
      WHERE batch_id = $1
    `,
    [summary.batchId],
  );
  assert.equal(itemRow.rows[0]?.status, 'failed');

  const txRow = await pool.query(
    `
      SELECT settled_batch_id, settled_at
      FROM payment_transactions
      WHERE id = $1
    `,
    [paymentTransactionId],
  );
  assert.equal(txRow.rows[0]?.settled_batch_id, null);
  assert.equal(txRow.rows[0]?.settled_at, null);

  await pool.end();
});

test('runSettlementCycle no-ops when there are no pending transactions', async () => {
  const pool = createMemoryPool();
  await runMigrations({ pool });

  const summary = await runSettlementCycle({
    pool: pool as never,
    now: new Date(Date.now() + 2 * 60 * 60 * 1000),
    payout: async () => ({
      txHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    }),
  });

  assert.equal(summary.batchId, null);
  assert.equal(summary.processedDevelopers, 0);
  assert.equal(summary.failedDevelopers, 0);

  await pool.end();
});
