# PayRail — Deferred Work

Items explicitly deferred from the Milestone 2 plan review. Each entry has priority,
effort, and enough context to pick up cold.

---

## P1 — Do before significant traffic

### ~~Consolidate dual pg.Pool singletons~~ ✅ DONE

Fixed in pool consolidation commit. All modules now import from `db/connection.ts`.

---

## P2 — Do in Milestone 3

### Wrap settlement batch creation in a database transaction

**What:** `runSettlementCycle()` in `settlement.ts` creates a settlement_batch, inserts
settlement_items, and claims payment_transactions across 10+ separate queries with no
wrapping transaction. A crash mid-cycle leaves a `queued` batch with partially-claimed
transactions. Per-item rollback logic exists (unclaiming txs on payout failure), but the
batch creation itself is not atomic.

**Scenario:** Server crashes after inserting `settlement_items` but before claiming all
`payment_transactions`. Result: orphaned batch in `queued` state, some transactions have
`settled_batch_id` set but no corresponding confirmed settlement_item. Next cycle skips
those transactions (they're "claimed"), so the developer never gets paid for them.

**Fix:** Wrap the batch insert → item inserts → payment_transaction claims in a single
`BEGIN`/`COMMIT` transaction. Only move to the payout phase after all staging is committed.
If staging fails, `ROLLBACK` cleanly.

**Effort:** M (1h)
**Blocked by:** Nothing — but increases lock contention on `payment_transactions`. At
current volume (daily settlement, low traffic), risk is negligible. Prioritise when
settlement volume > 100 transactions/batch.

---

### Delete metering.ts and the api_usage table

**What:** `packages/server/src/metering.ts` writes to an orphaned `api_usage` table that
is no longer read by anything (the `/api/usage` route was rewired in M2 to read
`meter_events`). The table and module are dead code.

**Fix:**
1. Confirm `/api/usage` is working correctly in production for at least 1 week.
2. Drop the `api_usage` table via a migration.
3. Delete `metering.ts` from the codebase.
4. Remove the `getUsageByApiKey` import that may linger in tests.

**Effort:** S (30 min)
**Blocked by:** Confirming M2 usage rewire is live and correct in production

---

### Add a DB-backed SpentTxStore for durable replay protection

**What:** The gateway currently uses `InMemorySpentTxStore` for replay protection. This
resets on every server restart, meaning the same `txHash` could theoretically be reused
across a restart window. The DB already enforces uniqueness via `payment_transactions.tx_hash`,
so a restart-reset doesn't cause double-spend — but it does reduce the defense-in-depth.

**Fix:** Implement a `DbSpentTxStore` that implements the `SpentTxStore` interface and
reads/writes to `payment_transactions`. Pass it to `verifyUsdcPayment` via the
`VerifyUsdcPaymentOptions.spentTxStore` field.

**Effort:** M (2h)
**Blocked by:** Nothing

---

### Add rate limiting to /v1/verify-and-meter

**What:** No rate limiting exists on any endpoint. For a payment API, `/v1/verify-and-meter`
is the most critical to rate-limit — unbounded calls drive up Base RPC costs and can
DoS the DB.

**Fix:** Add per-IP rate limiting middleware (e.g., Hono rate limiter backed by an
in-memory store, or Redis for multi-instance). Start with 60 req/min per IP.

**Effort:** M (2h)
**Blocked by:** Deciding whether to introduce Redis as a dependency

---

### Settlement for admin-created (developerless) endpoints

**What:** The settlement SQL JOINs `api_endpoints → developers` via `developer_id`. Admin-
created endpoints (like the demo) have `developer_id = NULL` and are silently excluded
from settlement. This is correct for now but should be addressed before any real
revenue flows through admin-created endpoints.

**Fix:** Change the settlement JOIN to `LEFT JOIN developers d ON d.id = ae.developer_id`
and handle the case where `destination_wallet` is null (skip the settlement item with
a log warning, or use a fallback wallet from env).

**Effort:** S (30 min)
**Blocked by:** Deciding the payout wallet for admin-created endpoints

---

## P3 — Milestone 4+

### ~~Remove lazy ensureSchema patterns from api-keys.ts and settlement.ts~~ ✅ DONE

Fixed in pool consolidation commit. `ensureApiKeySchema()` and `ensureSettlementSchema()`
removed. Migrations run at startup via `startServer()`.

---

### RPC retry logic for viem calls in verifier.ts

**What:** `verifyUsdcPayment` in `packages/gateway/src/verifier.ts` calls the Base RPC
node with no retry logic. A transient 429 or timeout returns a confusing 500 to the
caller. Base Sepolia's public RPC is rate-limited.

**Fix:** Wrap the viem `getTransactionReceipt` and `getBlockNumber` calls in a retry
with exponential backoff (3 attempts, 1s/2s/4s). Distinguish retryable errors (timeout,
429) from permanent errors (TX_NOT_FOUND, chain mismatch).

**Effort:** M (2h)
**Blocked by:** Nothing
