import assert from 'node:assert/strict';
import test from 'node:test';

import { newDb } from 'pg-mem';

import { createApp } from './index.js';

function createMemoryPool() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const pg = db.adapters.createPg();

  return new pg.Pool();
}

const walletAddress = '0x1111111111111111111111111111111111111111';

test('POST /api/keys creates key and stores hashed value', async () => {
  const pool = createMemoryPool();
  const app = createApp({
    pool: pool as never,
  });

  const response = await app.request('/api/keys', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      developerName: 'Acme API',
      developerEmail: 'team@acme.dev',
      walletAddress,
      label: 'Primary',
    }),
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.apiKey.startsWith('payrail_live_'), true);
  assert.equal(typeof body.developerId, 'string');

  const keyRow = await pool.query(
    `
      SELECT key_hash
      FROM api_keys
      WHERE id = $1
    `,
    [body.id],
  );

  assert.equal(keyRow.rowCount, 1);
  assert.equal(keyRow.rows[0]?.key_hash.length, 64);
  assert.notEqual(keyRow.rows[0]?.key_hash, body.apiKey);

  const developerRow = await pool.query(
    `
      SELECT default_payout_wallet
      FROM developers
      WHERE id = $1
    `,
    [body.developerId],
  );

  assert.equal(developerRow.rows[0]?.default_payout_wallet, walletAddress);
  await pool.end();
});

test('GET /api/keys requires x-api-key auth', async () => {
  const pool = createMemoryPool();
  const app = createApp({
    pool: pool as never,
  });

  const response = await app.request('/api/keys');
  assert.equal(response.status, 401);

  await pool.end();
});

test('GET and DELETE /api/keys use management key auth', async () => {
  const pool = createMemoryPool();
  const app = createApp({
    pool: pool as never,
  });

  const bootstrap = await app.request('/api/keys', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      developerName: 'PayRail Team',
      walletAddress,
      label: 'Bootstrap',
    }),
  });

  assert.equal(bootstrap.status, 201);
  const bootstrapBody = await bootstrap.json();
  const managementKey = bootstrapBody.apiKey as string;

  const secondary = await app.request('/api/keys', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': managementKey,
    },
    body: JSON.stringify({
      developerId: bootstrapBody.developerId,
      walletAddress,
      label: 'Secondary',
    }),
  });

  assert.equal(secondary.status, 201);
  const secondaryBody = await secondary.json();

  const listResponse = await app.request('/api/keys', {
    headers: {
      'x-api-key': managementKey,
    },
  });

  assert.equal(listResponse.status, 200);
  const listBody = await listResponse.json();
  assert.equal(listBody.keys.length, 2);

  const revokeResponse = await app.request(`/api/keys/${secondaryBody.id}`, {
    method: 'DELETE',
    headers: {
      'x-api-key': managementKey,
    },
  });

  assert.equal(revokeResponse.status, 200);
  const revokeBody = await revokeResponse.json();
  assert.equal(revokeBody.status, 'revoked');

  const revokedAccess = await app.request('/api/keys', {
    headers: {
      'x-api-key': secondaryBody.apiKey,
    },
  });
  assert.equal(revokedAccess.status, 401);

  await pool.end();
});

test('POST /api/keys returns 404 for unknown developerId', async () => {
  const pool = createMemoryPool();
  const app = createApp({
    pool: pool as never,
  });

  const response = await app.request('/api/keys', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      developerId: '11111111-1111-4111-8111-111111111111',
      walletAddress,
    }),
  });

  assert.equal(response.status, 404);
  await pool.end();
});
