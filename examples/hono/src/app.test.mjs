import assert from 'node:assert/strict';
import test from 'node:test';

import { SUCCESS_TX_HASH, createExampleApp } from './app.mjs';

test('example app returns 402 when payment header is missing', async () => {
  const { app } = createExampleApp({ mode: 'mock' });

  const response = await app.request('http://localhost/v1/private/echo');
  const body = await response.json();

  assert.equal(response.status, 402);
  assert.equal(body.error, 'PAYMENT_REQUIRED');
  assert.equal(body.code, 'MISSING_PAYMENT_HEADER');
});

test('example app returns 200 and records meter event for valid payment', async () => {
  const { app, meterEvents } = createExampleApp({ mode: 'mock' });

  const response = await app.request('http://localhost/v1/private/echo', {
    headers: {
      'x-payment-tx': SUCCESS_TX_HASH,
      'x-request-id': 'req_test_success',
    },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.allowed, true);
  assert.equal(meterEvents.length, 1);
  assert.equal(meterEvents[0].requestId, 'req_test_success');
});

test('example app returns rejection code from verifier', async () => {
  const { app, meterEvents } = createExampleApp({ mode: 'mock' });

  const response = await app.request('http://localhost/v1/private/echo', {
    headers: {
      'x-payment-tx': '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'x-request-id': 'req_test_failure',
    },
  });
  const body = await response.json();

  assert.equal(response.status, 402);
  assert.equal(body.error, 'PAYMENT_REQUIRED');
  assert.equal(body.code, 'TX_NOT_FOUND');
  assert.equal(meterEvents.length, 0);
});

