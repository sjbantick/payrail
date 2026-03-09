# @payrail/server

## Quickstart

1. Copy env defaults and set required values:
```bash
cp ../../.env.example .env
```

Required vars on startup:
- `DATABASE_URL`
- `USDC_CONTRACT_ADDRESS`

Optional vars:
- `HOST` (default: `0.0.0.0`)
- `PORT` (default: `3000`)

2. Start the API server:
```bash
pnpm --filter @payrail/server start
```

3. Smoke-check health endpoint:
```bash
curl -sSf http://127.0.0.1:3000/health
```

## API Key Management (`PAY-4`)

Management API routes:

- `POST /api/keys` — create API key (bootstrap or rotate)
- `GET /api/keys` — list keys for authenticated developer
- `DELETE /api/keys/:id` — revoke a key

Auth model:
- Include `X-API-Key: <plaintext-key>` on management requests.
- Keys are stored hashed (`sha256`) in PostgreSQL.

Create key example:
```bash
curl -sS -X POST http://127.0.0.1:3000/api/keys \
  -H 'content-type: application/json' \
  -d '{
    "developerName": "Acme API",
    "developerEmail": "team@acme.dev",
    "walletAddress": "0x1111111111111111111111111111111111111111",
    "label": "Primary"
  }'
```

## Settlement Engine (`PAY-5`)

Settlement worker entrypoint:

```bash
pnpm --filter @payrail/server settlement:worker
```

Behavior:
- Runs a settlement cycle on startup, then every hour.
- Batches accepted metered usage by developer.
- Applies `1.5%` platform fee.
- Writes settlement batch/item rows.
- Marks processed payment transactions as settled.

Required payout env vars for on-chain transfers:
- `USDC_CONTRACT_ADDRESS`
- `SETTLEMENT_SIGNER_PRIVATE_KEY`
- `BASE_RPC_URL` (optional if chain default RPC is acceptable)

## Dev Bootstrap (Migration-Compatible Endpoint Rows)

`/v1/verify-and-meter` reads `api_endpoints` from the canonical schema in `src/db/migrations/0001_payrail_schema.sql`.
The endpoint row must match that schema (`UUID` id plus required `developer_id`, `slug`, and `upstream_url` columns).

1. Build the package:
```bash
pnpm --filter @payrail/server build
```
2. Apply canonical migrations:
```bash
pnpm --filter @payrail/server db:migrate
```
3. Seed a compatible developer + endpoint fixture:
```bash
pnpm --filter @payrail/server db:seed
```
4. Use the printed `Seeded endpoint` UUID as `endpointId` in `/v1/verify-and-meter` requests.

Example request payload snippet:

```json
{
  "endpointId": "22222222-2222-4222-8222-222222222222",
  "requestId": "req_123",
  "payment": {
    "txHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "chainId": 8453,
    "token": "USDC"
  }
}
```

If you need to create rows manually, insert in this order to satisfy foreign keys:
1. `developers`
2. `api_endpoints`

## PAY-19 First Paid Request Demo

Run the end-to-end local demo (success + 402 failure path, with meter evidence output):

```bash
pnpm demo:first-payment
```

This command builds `@payrail/server` and executes `scripts/demo-first-payment.sh`, which:
- seeds a developer + endpoint + API key + payment intent fixture
- calls `POST /v1/verify-and-meter` once with a valid fixture tx hash (200)
- calls it again with an invalid fixture tx hash (402)
- prints `meterEventId`, tx hash, and aggregate usage evidence
