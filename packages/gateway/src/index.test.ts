import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { payrailGateway, type PayrailGatewayMeterInput } from './index.js';

const txHeaderValue = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

test('payrailGateway returns 402 when payment header is missing', async () => {
  const app = new Hono();
  app.use('*', payrailGateway());
  app.get('/protected', (c) => c.text('ok'));

  const response = await app.request('http://localhost/protected');
  const body = await response.json();

  assert.equal(response.status, 402);
  assert.equal(body.error, 'PAYMENT_REQUIRED');
  assert.equal(body.code, 'MISSING_PAYMENT_HEADER');
});

test('payrailGateway returns 402 when verifier rejects payment', async () => {
  let meterCalled = false;
  const app = new Hono();
  app.use(
    '*',
    payrailGateway({
      verifyPayment: async () => ({
        allowed: false,
        code: 'TX_NOT_FOUND',
        message: 'Transaction was not found.',
      }),
      meterRequest: async () => {
        meterCalled = true;
      },
    }),
  );
  app.get('/protected', (c) => c.text('ok'));

  const response = await app.request('http://localhost/protected', {
    headers: {
      'x-payment-tx': txHeaderValue,
    },
  });
  const body = await response.json();

  assert.equal(response.status, 402);
  assert.equal(body.error, 'PAYMENT_REQUIRED');
  assert.equal(body.code, 'TX_NOT_FOUND');
  assert.equal(meterCalled, false);
});

test('payrailGateway meters request and forwards to next on success', async () => {
  const meterCalls: PayrailGatewayMeterInput[] = [];
  let handlerReached = false;

  const app = new Hono();
  app.use(
    '*',
    payrailGateway({
      verifyPayment: async ({ txHash }) => ({
        allowed: true,
        txHash,
      }),
      meterRequest: async (params) => {
        meterCalls.push(params);
      },
    }),
  );
  app.get('/protected', (c) => {
    handlerReached = true;
    return c.text('ok');
  });

  const response = await app.request('http://localhost/protected', {
    headers: {
      'x-payment-tx': txHeaderValue,
      'x-request-id': 'req_123',
    },
  });
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(body, 'ok');
  assert.equal(handlerReached, true);
  assert.equal(meterCalls.length, 1);
  assert.equal(meterCalls[0].txHash, txHeaderValue);
  assert.equal(meterCalls[0].requestId, 'req_123');
  assert.equal(meterCalls[0].path, '/protected');
});

test('payrailGateway returns 500 when metering fails', async () => {
  const app = new Hono();
  app.use(
    '*',
    payrailGateway({
      verifyPayment: async ({ txHash }) => ({
        allowed: true,
        txHash,
      }),
      meterRequest: async () => {
        throw new Error('db unavailable');
      },
    }),
  );
  app.get('/protected', (c) => c.text('ok'));

  const response = await app.request('http://localhost/protected', {
    headers: {
      'x-payment-tx': txHeaderValue,
    },
  });
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error, 'METERING_ERROR');
});
