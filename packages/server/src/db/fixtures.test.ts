import assert from 'node:assert/strict';
import test from 'node:test';

import { newDb } from 'pg-mem';

import { seedDevFixtures } from './fixtures.js';
import { runMigrations } from './migrate.js';

function createMemoryPool() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const pg = db.adapters.createPg();

  return new pg.Pool();
}

async function getCount(pool: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ count: number | string }> }> }, tableName: string): Promise<number> {
  const result = await pool.query(`SELECT COUNT(*) AS count FROM ${tableName}`);
  return Number(result.rows[0]?.count ?? 0);
}

test('seedDevFixtures inserts developer, endpoint, api key, and payment intent', async () => {
  const pool = createMemoryPool();
  await runMigrations({ pool });

  const fixtures = await seedDevFixtures(pool, {
    endpointSlug: 'seeded-endpoint',
    upstreamUrl: 'https://seeded.example/api',
    pricePerCallUsdcMicro: 1500n,
  });

  assert.equal(fixtures.endpoint.slug, 'seeded-endpoint');
  assert.equal(String(fixtures.endpoint.pricePerCallUsdcMicro), '1500');
  assert.equal(fixtures.apiKey.keyHash.length, 64);
  assert.equal(String(fixtures.paymentIntent.requiredAmountUsdcMicro), '1500');
  assert.equal(fixtures.plaintextApiKey.startsWith('payrail_dev_'), true);

  assert.equal(await getCount(pool, 'developers'), 1);
  assert.equal(await getCount(pool, 'api_endpoints'), 1);
  assert.equal(await getCount(pool, 'api_keys'), 1);
  assert.equal(await getCount(pool, 'payment_intents'), 1);

  await pool.end();
});
