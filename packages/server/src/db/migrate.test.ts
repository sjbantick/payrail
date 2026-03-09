import assert from 'node:assert/strict';
import test from 'node:test';

import { newDb } from 'pg-mem';

import {
  createApiEndpoint,
  createDeveloper,
  createMeterEvent,
  createPaymentIntent,
  createPaymentTransaction,
} from './models.js';
import { runMigrations } from './migrate.js';

function createMemoryPool() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const pg = db.adapters.createPg();

  return new pg.Pool();
}

test('runMigrations applies PayRail schema SQL and creates expected tables', async () => {
  const pool = createMemoryPool();

  const summary = await runMigrations({ pool });
  assert.equal(summary.applied.includes('0001_payrail_schema.sql'), true);

  const tables = [
    'developers',
    'api_endpoints',
    'api_keys',
    'payment_intents',
    'payment_transactions',
    'meter_events',
    'settlement_batches',
    'settlement_items',
  ];

  for (const tableName of tables) {
    const result = await pool.query(
      `
      SELECT COUNT(*) AS count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    `,
      [tableName],
    );

    assert.equal(result.rows[0]?.count, 1);
  }

  const replay = await runMigrations({ pool });
  assert.equal(replay.applied.length, 0);
  assert.equal(replay.skipped.includes('0001_payrail_schema.sql'), true);

  await pool.end();
});

test('schema enforces idempotency and replay constraints', async () => {
  const pool = createMemoryPool();
  await runMigrations({ pool });

  const developer = await createDeveloper(pool, {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Acme API',
    defaultPayoutWallet: '0x1111111111111111111111111111111111111111',
  });

  const endpoint = await createApiEndpoint(pool, {
    id: '22222222-2222-4222-8222-222222222222',
    developerId: developer.id,
    slug: 'acme-weather',
    upstreamUrl: 'https://acme.example/weather',
    pricePerCallUsdcMicro: 1000n,
    receiverWallet: '0x1111111111111111111111111111111111111111',
  });

  await createPaymentIntent(pool, {
    id: '33333333-3333-4333-8333-333333333333',
    endpointId: endpoint.id,
    idempotencyKey: 'idem-1',
    requiredAmountUsdcMicro: 1000n,
    status: 'pending',
    expiresAt: new Date('2026-03-05T02:00:00.000Z'),
  });

  await assert.rejects(async () => {
    await createPaymentIntent(pool, {
      id: '44444444-4444-4444-8444-444444444444',
      endpointId: endpoint.id,
      idempotencyKey: 'idem-1',
      requiredAmountUsdcMicro: 1000n,
      status: 'pending',
      expiresAt: new Date('2026-03-05T02:30:00.000Z'),
    });
  });

  await createPaymentTransaction(pool, {
    id: '55555555-5555-4555-8555-555555555555',
    txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    chainId: 8453n,
    tokenContract: '0x036CbD53842c5426634e7929541eC2318f3dCf7e',
    fromWallet: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    toWallet: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    amountUsdcMicro: 1000n,
    blockNumber: 100n,
    confirmations: 2,
    status: 'verified',
    verifiedAt: new Date('2026-03-05T01:00:00.000Z'),
  });

  await assert.rejects(async () => {
    await createPaymentTransaction(pool, {
      id: '66666666-6666-4666-8666-666666666666',
      txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chainId: 8453n,
      tokenContract: '0x036CbD53842c5426634e7929541eC2318f3dCf7e',
      fromWallet: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      toWallet: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      amountUsdcMicro: 1000n,
      blockNumber: 101n,
      confirmations: 3,
      status: 'verified',
      verifiedAt: new Date('2026-03-05T01:01:00.000Z'),
    });
  });

  await createMeterEvent(pool, {
    id: '77777777-7777-4777-8777-777777777777',
    endpointId: endpoint.id,
    requestId: 'req-1',
    units: 1n,
    unitPriceUsdcMicro: 1000n,
    totalPriceUsdcMicro: 1000n,
    status: 'accepted',
  });

  await assert.rejects(async () => {
    await createMeterEvent(pool, {
      id: '88888888-8888-4888-8888-888888888888',
      endpointId: endpoint.id,
      requestId: 'req-1',
      units: 1n,
      unitPriceUsdcMicro: 1000n,
      totalPriceUsdcMicro: 1000n,
      status: 'accepted',
    });
  });

  await pool.end();
});
