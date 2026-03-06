# `@payrail/example-hono`

Runnable local app showing how to protect paid routes with `@payrail/gateway` and verify/meter requests.

## Modes

- `mock` (default): no backend dependency, deterministic success/failure tx fixtures
- `remote`: calls PayRail `POST /v1/verify-and-meter`

## Run

From repo root:

```bash
pnpm install
pnpm --filter @payrail/example-hono start
```

Server starts at `http://127.0.0.1:8787`.

## Sample requests (mock mode)

Success path:

```bash
curl -sS http://127.0.0.1:8787/v1/private/echo \
  -H 'x-payment-tx: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \
  -H 'x-request-id: req_demo_success_1'
```

Expected `200` response:

```json
{
  "allowed": true,
  "mode": "mock",
  "route": "/v1/private/echo",
  "requestId": "req_demo_success_1",
  "paymentTxHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

Failure path:

```bash
curl -sS http://127.0.0.1:8787/v1/private/echo \
  -H 'x-payment-tx: 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' \
  -H 'x-request-id: req_demo_failure_1'
```

Expected `402` response:

```json
{
  "error": "PAYMENT_REQUIRED",
  "code": "TX_NOT_FOUND",
  "message": "Transaction hash was not found on chain."
}
```

Metering evidence:

```bash
curl -sS http://127.0.0.1:8787/v1/meter-events
```

## Remote mode (optional)

Use real verify-and-meter integration:

```bash
PAYRAIL_EXAMPLE_MODE=remote \
PAYRAIL_VERIFY_AND_METER_URL=http://127.0.0.1:3000/v1/verify-and-meter \
PAYRAIL_ENDPOINT_ID=22222222-2222-4222-8222-222222222222 \
PAYRAIL_CHAIN_ID=8453 \
PAYRAIL_TOKEN=USDC \
pnpm --filter @payrail/example-hono start
```

In remote mode, rejection reasons are normalized from `details.reason` so callers see stable machine-readable codes.

