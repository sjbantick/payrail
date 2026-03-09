# Milestone 1 Status (2026-03-05)

## Status

- Milestone target: **Core SDK live**
- Current state: **Yellow (not yet shippable demo)**
- Summary: core verification + metering primitives are implemented and tested, but the installable middleware path (`@payrail/gateway`) and runnable demo path are incomplete.

## Audit: What Exists vs Stub

| Area | Evidence in Repo | Assessment |
| --- | --- | --- |
| Monorepo foundation | `pnpm-workspace.yaml`, `packages/gateway`, `packages/server` | Implemented |
| USDC verification core | `packages/gateway/src/verifier.ts` + `verifier.test.ts` (5 passing tests) | Implemented |
| `@payrail/gateway` installable middleware | `packages/gateway/src/index.ts` only re-exports verifier symbols; no request-intercept middleware | **Stub / not delivered** |
| Verify-and-meter API | `packages/server/src/verify-and-meter.ts` + tests for success/failure/idempotency | Implemented |
| Canonical metering schema migration | `packages/server/src/db/migrations/0001_payrail_schema.sql` + migration tests | Implemented |
| Runtime DB contract consistency | `verify-and-meter.ts` also creates a reduced runtime schema variant | **Risk / mismatch to canonical schema** |
| Runnable API process | `@payrail/server` `start` points to `dist/index.js`; current `index.ts` creates app but does not bind/listen | **Missing** |
| End-to-end first-paid-request demo script | No reproducible script/workflow in repo root | **Missing** |

## PAY-12 Assessment (`@payrail/gateway` middleware)

- Issue `PAY-12` is still `todo` and is the core product surface developers install.
- Current package code provides verification primitives, not middleware behavior.
- Conclusion: `PAY-12` is **not truly built yet** for Milestone 1 acceptance.

## Exact 3 Steps for a Developer to Wrap an API and Accept First USDC Payment

1. **Run PayRail verifier+meter service and configure endpoint pricing**
   - Start `@payrail/server` with `DATABASE_URL`, `USDC_CONTRACT_ADDRESS`, and chain config.
   - Ensure `api_endpoints` has an `endpointId`, `receiver_wallet`, and `price_per_call_usdc_micro` row.
2. **Install and mount `@payrail/gateway` on paid routes**
   - Add middleware to the route(s) to protect.
   - Middleware must send `endpointId`, `requestId`, payment tx hash, and chain metadata to `POST /v1/verify-and-meter`.
3. **Send first paid request with a valid Base USDC transfer tx hash**
   - Include payment metadata header/body expected by middleware.
   - On valid payment: request is forwarded upstream.
   - On invalid/missing payment: client gets `402 PAYMENT_REQUIRED`.

Note: Step 2 is blocked until `PAY-12` middleware implementation is completed.

## Blockers

- `PAY-12` middleware implementation not complete (core milestone blocker).
- Server runtime bootstrap is incomplete (`start` does not expose a listening HTTP process).
- Verify-and-meter runtime schema bootstrap diverges from canonical migration schema, creating integration risk.

## Next 3 Actions

1. **`PAY-17`** — Align verify-and-meter runtime schema with canonical migrations.
2. **`PAY-18`** — Add runnable API server bootstrap + env validation + startup smoke test.
3. **`PAY-19`** — Ship reproducible first-paid-request end-to-end demo script.

Related open blocker:
- **`PAY-12`** — Implement installable `@payrail/gateway` middleware skeleton (must be finished for milestone completion).
