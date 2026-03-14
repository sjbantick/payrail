# `@payrail/gateway`

**Hono middleware that turns any API endpoint into a paid endpoint — powered by on-chain USDC payments on Base.**

Clients pay per request by attaching a USDC transaction hash. The middleware verifies the payment on-chain and lets the request through (or returns `402 Payment Required`).

```
  Client ──[x-payment-tx: 0xabc...]──▶  Your Hono route
                                              │
                                    payrailGateway middleware
                                              │
                               verify payment on Base (USDC)
                                              │
                          ┌───────────────────┴──────────────────────┐
                       allowed                                    rejected
                          │                                           │
                   handler executes                          402 + paymentInstructions
```

---

## Install

```bash
npm install @payrail/gateway
# or
pnpm add @payrail/gateway
```

Requires **Hono** (`^4.0`) as a peer dependency.

---

## Try it live

Before writing any code, send a real paid request to the PayRail demo endpoint (Base Sepolia testnet — free USDC from any faucet):

```bash
# 1. Send 0.001 USDC to the demo receiver on Base Sepolia
#    Receiver: check https://payrail-production.up.railway.app/v1/demo for current address

# 2. Once confirmed, POST the tx hash:
curl -X POST https://payrail-production.up.railway.app/v1/demo \
  -H "content-type: application/json" \
  -d '{
    "requestId": "my-first-request",
    "payment": {
      "txHash": "0xYOUR_TX_HASH_HERE",
      "chainId": 84532,
      "token": "USDC"
    }
  }'

# Response:
# { "allowed": true, "fact": "Wombat droppings are cube-shaped.", "chargedUsdcMicro": 1000 }
```

---

## Quickstart (5 minutes)

### Step 1 — Register your endpoint

```bash
curl -X POST https://payrail-production.up.railway.app/api/endpoints \
  -H "content-type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_KEY" \
  -d '{
    "slug": "my-api",
    "upstreamUrl": "https://your-api.com/paid",
    "pricePerCallUsdcMicro": 1000,
    "receiverWallet": "0xYOUR_WALLET_ADDRESS"
  }'

# Response includes your endpointId — save it.
```

### Step 2 — Add the middleware

```ts
import { Hono } from 'hono';
import { payrailGateway } from '@payrail/gateway';

const app = new Hono();

const ENDPOINT_ID = 'YOUR_ENDPOINT_ID_FROM_STEP_1';
const VERIFY_URL = 'https://payrail-production.up.railway.app/v1/verify-and-meter';

app.use('/paid/*', payrailGateway({
  verifyPayment: async ({ txHash, requestId, method, path }) => {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        endpointId: ENDPOINT_ID,
        requestId,
        payment: { txHash, chainId: 84532, token: 'USDC' },
        usage: { units: 1 },
        context: { method, path },
      }),
    });

    const data = await res.json() as { allowed: boolean; code?: string; message?: string; details?: { reason?: string } };

    if (res.ok && data.allowed) {
      return { allowed: true, txHash };
    }

    return {
      allowed: false,
      code: data.details?.reason ?? data.code ?? 'PAYMENT_REQUIRED',
      message: data.message ?? 'Payment verification failed.',
    };
  },
}));

app.get('/paid/hello', (c) => c.json({ message: 'You paid. Hello!' }));
```

### Step 3 — Call your API

```bash
# No payment header → 402
curl http://localhost:3000/paid/hello
# {"error":"PAYMENT_REQUIRED","code":"MISSING_PAYMENT_HEADER","message":"..."}

# With a valid USDC tx on Base Sepolia → 200
curl http://localhost:3000/paid/hello \
  -H "x-payment-tx: 0xYOUR_TX_HASH" \
  -H "x-request-id: req_abc123"
# {"message":"You paid. Hello!"}
```

---

## How it works

1. **Client** sends a request with `x-payment-tx: <txHashOfUSDCTransfer>` and `x-request-id: <uniqueId>`.
2. **Middleware** calls your `verifyPayment` function with `{ txHash, requestId, method, path }`.
3. **`verifyPayment`** calls `/v1/verify-and-meter` on the PayRail server, which:
   - Looks up your endpoint's price and receiver wallet.
   - Verifies the USDC transfer on-chain (Base / Base Sepolia).
   - Records the metered usage (idempotent — same `requestId` always returns the same result).
4. **Middleware** passes the request through on success, or returns `402` with `paymentInstructions` on failure.

### What the client gets on 402

```json
{
  "error": "PAYMENT_REQUIRED",
  "code": "PAYMENT_REQUIRED",
  "message": "Valid USDC payment not found for this request",
  "requiredUsdcMicro": 1000,
  "details": { "chainId": 84532, "receiver": "0x...", "reason": "TX_NOT_FOUND" },
  "paymentInstructions": {
    "chainId": 84532,
    "receiver": "0xYOUR_WALLET",
    "requiredUsdcMicro": 1000,
    "token": "USDC",
    "note": "Send 0.000001 USDC to 0xYOUR_WALLET on chain 84532, then retry with the transaction hash."
  }
}
```

---

## API Reference

### `payrailGateway(options)`

Hono middleware factory.

```ts
import { payrailGateway, type PayrailGatewayOptions } from '@payrail/gateway';

const middleware = payrailGateway({
  // Required: called with { txHash, requestId, method, path }
  verifyPayment: async (input) => { ... },

  // Optional: called after verification succeeds, before handler runs
  meterRequest: async (input) => { ... },

  // Optional: header name for the payment tx (default: 'x-payment-tx')
  paymentHeaderName: 'x-payment-tx',

  // Optional: header name for the request ID (default: 'x-request-id')
  requestIdHeaderName: 'x-request-id',
});
```

### `verifyUsdcPayment(input, options?)`

Low-level on-chain USDC payment verifier (no server required).

```ts
import { verifyUsdcPayment } from '@payrail/gateway';

const result = await verifyUsdcPayment(
  {
    txHash: '0xabc...',
    expectedReceiver: '0xYOUR_WALLET',
    usdcContract: '0x036CbD53842c5426634e7929541eC2318f3dCf7e', // Base Sepolia USDC
    minimumAmountUsdcMicro: 1000n, // 0.001 USDC
    expectedChainId: 84532,
    minimumConfirmations: 1,
  },
  {
    chainEnv: 'base-sepolia', // or 'base-mainnet'
    // rpcUrl: 'https://...',  // optional RPC override
  }
);

if (result.allowed) {
  console.log('Verified:', result.amountUsdcMicro, 'from', result.fromWallet);
} else {
  console.log('Rejected:', result.code); // e.g. 'TX_NOT_FOUND'
}
```

### Rejection codes

| Code | Meaning |
|------|---------|
| `MISSING_PAYMENT_HEADER` | `x-payment-tx` header not present |
| `TX_NOT_FOUND` | Transaction hash not found on chain |
| `TX_FAILED` | Transaction reverted |
| `CHAIN_MISMATCH` | Transaction is on a different chain than expected |
| `TRANSFER_NOT_FOUND` | No USDC Transfer log found in the transaction |
| `WRONG_RECIPIENT` | USDC transferred to the wrong wallet |
| `INSUFFICIENT_AMOUNT` | USDC amount below the required price |
| `TX_ALREADY_SPENT` | Transaction hash already used for another request |
| `INSUFFICIENT_CONFIRMATIONS` | Not enough block confirmations yet |
| `UNSUPPORTED_TOKEN` | Token is not USDC |
| `PAYMENT_ALREADY_USED` | Same tx used for a different `requestId` |

---

## Network & token addresses

| Network | Chain ID | USDC Contract |
|---------|----------|---------------|
| Base Mainnet | 8453 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base Sepolia (testnet) | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCf7e` |

Get testnet USDC: [Coinbase faucet](https://portal.cdp.coinbase.com/products/faucet)

---

## Response headers

On a successful payment, the server adds:

```
x-payrail-charged: 1000   ← charged amount in USDC micro-units
```

---

## Production server

| Endpoint | Description |
|----------|-------------|
| `POST /v1/verify-and-meter` | Verify payment + record metered usage |
| `POST /v1/demo` | Live demo endpoint (costs 0.001 USDC) |
| `POST /api/endpoints` | Register a new paid endpoint (admin key required) |
| `GET /api/endpoints` | List all endpoints (admin key required) |
| `GET /api/usage/:apiKey` | Usage stats for an API key |
| `GET /health` | Health check |

Base URL: `https://payrail-production.up.railway.app`

---

## License

MIT
