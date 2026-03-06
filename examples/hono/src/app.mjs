import { Hono } from 'hono';

import { payrailGateway } from '@payrail/gateway';

const DEFAULT_ENDPOINT_ID = '22222222-2222-4222-8222-222222222222';
const DEFAULT_CHAIN_ID = 8453;
const DEFAULT_TOKEN = 'USDC';

export const SUCCESS_TX_HASH =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const INSUFFICIENT_TX_HASH =
  '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

function normalizeMode(mode, verifyAndMeterUrl) {
  if (mode === 'remote' || mode === 'mock') {
    return mode;
  }

  return verifyAndMeterUrl ? 'remote' : 'mock';
}

function verifyWithMock(txHash) {
  if (txHash.toLowerCase() === SUCCESS_TX_HASH.toLowerCase()) {
    return {
      allowed: true,
      txHash,
      details: {
        source: 'mock',
      },
    };
  }

  if (txHash.toLowerCase() === INSUFFICIENT_TX_HASH.toLowerCase()) {
    return {
      allowed: false,
      code: 'INSUFFICIENT_AMOUNT',
      message: 'USDC transfer amount is below required price.',
      details: {
        requiredAmountUsdcMicro: '1000',
        observedAmountUsdcMicro: '100',
      },
    };
  }

  return {
    allowed: false,
    code: 'TX_NOT_FOUND',
    message: 'Transaction hash was not found on chain.',
  };
}

async function verifyWithRemote(input, params) {
  try {
    const response = await fetch(params.verifyAndMeterUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        endpointId: params.endpointId,
        requestId: input.requestId,
        payment: {
          txHash: input.txHash,
          chainId: params.chainId,
          token: params.token,
        },
        usage: { units: 1 },
        context: {
          method: input.method,
          path: input.path,
        },
      }),
    });

    const payload = await response.json().catch(() => undefined);

    if (response.ok && payload?.allowed === true) {
      return {
        allowed: true,
        txHash: input.txHash,
        details: {
          source: 'verify-and-meter',
          meterEventId: payload?.meterEventId,
          chargedUsdcMicro: payload?.chargedUsdcMicro,
        },
      };
    }

    if (response.status === 402 && payload?.allowed === false) {
      return {
        allowed: false,
        code: payload?.details?.reason ?? payload?.code ?? 'PAYMENT_REQUIRED',
        message: payload?.message ?? 'Payment verification failed.',
        details: {
          verifyAndMeterCode: payload?.code,
          requiredUsdcMicro: payload?.requiredUsdcMicro,
        },
      };
    }

    return {
      allowed: false,
      code: 'VERIFY_AND_METER_REQUEST_FAILED',
      message: `Unexpected verify-and-meter response (${response.status}).`,
      details: {
        status: response.status,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to reach verify-and-meter endpoint.';

    return {
      allowed: false,
      code: 'VERIFY_AND_METER_UNAVAILABLE',
      message,
    };
  }
}

export function createExampleApp(options = {}) {
  const verifyAndMeterUrl = options.verifyAndMeterUrl ?? null;
  const mode = normalizeMode(options.mode, verifyAndMeterUrl);

  const endpointId = options.endpointId ?? DEFAULT_ENDPOINT_ID;
  const chainId = options.chainId ?? DEFAULT_CHAIN_ID;
  const token = options.token ?? DEFAULT_TOKEN;

  const meterEvents = [];
  const app = new Hono();

  app.use(
    '/v1/private/*',
    payrailGateway({
      verifyPayment: async (input) => {
        if (mode === 'remote') {
          return verifyWithRemote(input, {
            verifyAndMeterUrl,
            endpointId,
            chainId,
            token,
          });
        }

        return verifyWithMock(input.txHash);
      },
      meterRequest: async ({ txHash, requestId, method, path }) => {
        meterEvents.push({
          txHash,
          requestId,
          method,
          path,
          mode,
          recordedAt: new Date().toISOString(),
        });
      },
    }),
  );

  app.get('/', (c) =>
    c.json({
      service: '@payrail/example-hono',
      mode,
      successTxHash: SUCCESS_TX_HASH,
      insufficientTxHash: INSUFFICIENT_TX_HASH,
    }),
  );

  app.get('/health', (c) => c.json({ ok: true, mode }));

  app.get('/v1/private/echo', (c) => {
    return c.json({
      allowed: true,
      mode,
      route: '/v1/private/echo',
      requestId: c.req.header('x-request-id') ?? null,
      paymentTxHash: c.req.header('x-payment-tx') ?? null,
    });
  });

  app.get('/v1/meter-events', (c) =>
    c.json({
      mode,
      count: meterEvents.length,
      items: meterEvents,
    }),
  );

  return {
    app,
    meterEvents,
    mode,
    config: {
      verifyAndMeterUrl,
      endpointId,
      chainId,
      token,
    },
  };
}

