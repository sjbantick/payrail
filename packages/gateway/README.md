# `@payrail/gateway`

Payment-gating middleware and verification helpers for paid API routes.

## Quickstart

### 1) Install

```bash
pnpm add @payrail/gateway hono
```

### 2) Configure required environment variables

For middleware + PayRail `/v1/verify-and-meter` integration:

- `PAYRAIL_VERIFY_AND_METER_URL` (example: `http://127.0.0.1:3000/v1/verify-and-meter`)
- `PAYRAIL_ENDPOINT_ID` (UUID for your paid endpoint row)

Optional:

- `PAYRAIL_CHAIN_ID` (default `8453`)
- `PAYRAIL_TOKEN` (default `USDC`)

For direct on-chain verification with `verifyUsdcPayment`, set:

- `CHAIN_ENV` (`base-mainnet` or `base-sepolia`, default `base-sepolia`)
- `BASE_RPC_URL` (optional override)

### 3) Minimal usage snippet

```ts
import { Hono } from 'hono';
import { payrailGateway } from '@payrail/gateway';

const app = new Hono();

app.use('/v1/private/*', payrailGateway({
  verifyPayment: async ({ txHash, requestId, method, path }) => {
    const response = await fetch(process.env.PAYRAIL_VERIFY_AND_METER_URL!, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        endpointId: process.env.PAYRAIL_ENDPOINT_ID,
        requestId,
        payment: {
          txHash,
          chainId: Number(process.env.PAYRAIL_CHAIN_ID ?? '8453'),
          token: process.env.PAYRAIL_TOKEN ?? 'USDC'
        },
        usage: { units: 1 },
        context: { method, path }
      })
    });

    const payload = await response.json();

    if (response.ok && payload.allowed) {
      return { allowed: true, txHash };
    }

    return {
      allowed: false,
      code: payload?.details?.reason ?? payload?.code ?? 'PAYMENT_REQUIRED',
      message: payload?.message ?? 'Payment verification failed.'
    };
  }
}));

app.get('/v1/private/hello', (c) => c.json({ ok: true }));
```

## Runnable example app

See `examples/hono` for a local app that wires `payrailGateway` to:

- mock mode (default, no backend required)
- optional remote mode calling PayRail `/v1/verify-and-meter`

Start it from repo root:

```bash
pnpm --filter @payrail/example-hono start
```

## Verification flow (gateway + verify-and-meter)

1. Client sends request with `x-payment-tx` and optional `x-request-id`.
2. `payrailGateway` invokes your `verifyPayment` callback.
3. Callback verifies payment (directly on-chain or by calling `/v1/verify-and-meter`).
4. If verification fails, gateway responds `402` with:
   - `error: "PAYMENT_REQUIRED"`
   - `code: <verification code>`
5. If verification succeeds, `meterRequest` runs and the protected handler executes.

## Error codes (aligned with PAY-27 response contract)

Gateway-level responses:

- `MISSING_PAYMENT_HEADER`
- `PAYMENT_VERIFIER_NOT_CONFIGURED`
- `PAYMENT_VERIFICATION_ERROR` (`500`)
- `METERING_ERROR` (`500`)

Verifier rejection codes (`verifyUsdcPayment`):

- `TX_NOT_FOUND`
- `TX_FAILED`
- `CHAIN_MISMATCH`
- `TRANSFER_NOT_FOUND`
- `WRONG_RECIPIENT`
- `INSUFFICIENT_AMOUNT`
- `TX_ALREADY_SPENT`
- `INSUFFICIENT_CONFIRMATIONS`

`/v1/verify-and-meter` mapping (PAY-27):

- top-level `code`: `PAYMENT_REQUIRED` or `PAYMENT_ALREADY_USED`
- normalized reason: `details.reason` (for example `TX_NOT_FOUND`, `CHAIN_MISMATCH`, `INSUFFICIENT_AMOUNT`, `TX_ALREADY_SPENT`, `UNSUPPORTED_TOKEN`)

When proxying through gateway, return `details.reason` as the gateway failure `code` so upstream clients receive stable machine-readable rejection causes.
