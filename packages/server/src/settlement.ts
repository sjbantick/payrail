import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { getBaseChainFromEnv } from '@payrail/gateway';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createWalletClient,
  erc20Abi,
  http,
  type Address,
  type Hex,
  type WalletClient,
} from 'viem';
import { getDatabasePool, type QueryablePool } from './db/connection.js';

interface SettlementWindowRow {
  max_to_ts: Date | null;
}

interface PendingDeveloperSettlementRow {
  developer_id: string;
  destination_wallet: string;
  gross_usdc_micro: string;
  payment_tx_ids: string[];
}

export interface SettlementRunResult {
  batchId: string | null;
  fromTs: string | null;
  toTs: string | null;
  processedDevelopers: number;
  failedDevelopers: number;
  totalGrossUsdcMicro: string;
  totalFeeUsdcMicro: string;
  totalNetUsdcMicro: string;
}

export interface SettlementPayoutInput {
  destinationWallet: Address;
  netAmountUsdcMicro: bigint;
  developerId: string;
  batchId: string;
}

export interface SettlementPayoutResult {
  txHash: string;
}

export type SettlementPayoutExecutor = (
  input: SettlementPayoutInput,
) => Promise<SettlementPayoutResult> | SettlementPayoutResult;

export interface SettlementRunOptions {
  pool?: QueryablePool;
  now?: Date;
  feeBps?: bigint;
  payout?: SettlementPayoutExecutor;
  chainEnv?: ChainEnv;
  rpcUrl?: string;
  usdcContractAddress?: string;
  settlementSignerPrivateKey?: Hex;
}

type ChainEnv = 'base-mainnet' | 'base-sepolia';

export interface SettlementCronOptions extends SettlementRunOptions {
  intervalMs?: number;
  runOnStart?: boolean;
}

interface StagedSettlement {
  itemId: string;
  developerId: string;
  destinationWallet: string;
  netUsdcMicro: bigint;
  claimedTransactionIds: string[];
}

const DEFAULT_FEE_BPS = 150n;
const ONE_HOUR_MS = 60 * 60 * 1000;

function floorToHour(date: Date): Date {
  return new Date(date.getTime() - (date.getTime() % ONE_HOUR_MS));
}

function parseBigInt(value: string): bigint {
  return BigInt(value);
}

function bigintToString(value: bigint): string {
  return value.toString();
}

function calculateFee(grossUsdcMicro: bigint, feeBps: bigint): bigint {
  return (grossUsdcMicro * feeBps) / 10_000n;
}

function getPool(pool?: QueryablePool): QueryablePool {
  return pool ?? getDatabasePool();
}

async function getSettlementWindow(pool: QueryablePool, now: Date): Promise<{ from: Date; to: Date } | null> {
  const to = floorToHour(now);

  const result = await pool.query<SettlementWindowRow>(
    `
      SELECT MAX(to_ts) AS max_to_ts
      FROM settlement_batches
    `,
  );

  const from = result.rows[0]?.max_to_ts ?? new Date(0);
  if (from >= to) {
    return null;
  }

  return { from, to };
}

async function getPendingSettlementsByDeveloper(params: {
  pool: QueryablePool;
  from: Date;
  to: Date;
}): Promise<PendingDeveloperSettlementRow[]> {
  const result = await params.pool.query<PendingDeveloperSettlementRow>(
    `
      SELECT
        ae.developer_id,
        d.default_payout_wallet AS destination_wallet,
        SUM(me.total_price_usdc_micro)::text AS gross_usdc_micro,
        ARRAY_AGG(DISTINCT pt.id) AS payment_tx_ids
      FROM meter_events me
      JOIN payment_transactions pt ON pt.id = me.payment_transaction_id
      JOIN api_endpoints ae ON ae.id = me.endpoint_id
      JOIN developers d ON d.id = ae.developer_id
      WHERE me.status = 'accepted'
        AND pt.status = 'verified'
        AND pt.settled_batch_id IS NULL
        AND me.created_at >= $1
        AND me.created_at < $2
      GROUP BY ae.developer_id, d.default_payout_wallet
      ORDER BY ae.developer_id
    `,
    [params.from, params.to],
  );

  return result.rows;
}

function createDefaultSettlementPayoutExecutor(options: SettlementRunOptions): SettlementPayoutExecutor {
  const chain = getBaseChainFromEnv(options.chainEnv);
  const rpcUrl = options.rpcUrl ?? process.env.BASE_RPC_URL ?? chain.rpcUrls.default.http[0];
  const usdcContractAddress = options.usdcContractAddress ?? process.env.USDC_CONTRACT_ADDRESS;
  const privateKey = options.settlementSignerPrivateKey ?? process.env.SETTLEMENT_SIGNER_PRIVATE_KEY;

  if (!usdcContractAddress) {
    throw new Error('USDC_CONTRACT_ADDRESS is required for settlement payouts.');
  }

  if (!privateKey) {
    throw new Error('SETTLEMENT_SIGNER_PRIVATE_KEY is required for settlement payouts.');
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error('SETTLEMENT_SIGNER_PRIVATE_KEY must be a 32-byte hex private key.');
  }

  const account = privateKeyToAccount(privateKey as Hex);
  const client: WalletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  return async (input) => {
    const txHash = await client.writeContract({
      chain,
      address: usdcContractAddress as Address,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [input.destinationWallet, input.netAmountUsdcMicro],
      account,
    });

    return { txHash };
  };
}

export async function runSettlementCycle(options: SettlementRunOptions = {}): Promise<SettlementRunResult> {
  const pool = getPool(options.pool);
  const now = options.now ?? new Date();
  const feeBps = options.feeBps ?? DEFAULT_FEE_BPS;

  const window = await getSettlementWindow(pool, now);
  if (!window) {
    return {
      batchId: null,
      fromTs: null,
      toTs: null,
      processedDevelopers: 0,
      failedDevelopers: 0,
      totalGrossUsdcMicro: '0',
      totalFeeUsdcMicro: '0',
      totalNetUsdcMicro: '0',
    };
  }

  const pendingByDeveloper = await getPendingSettlementsByDeveloper({
    pool,
    from: window.from,
    to: window.to,
  });

  if (pendingByDeveloper.length === 0) {
    return {
      batchId: null,
      fromTs: window.from.toISOString(),
      toTs: window.to.toISOString(),
      processedDevelopers: 0,
      failedDevelopers: 0,
      totalGrossUsdcMicro: '0',
      totalFeeUsdcMicro: '0',
      totalNetUsdcMicro: '0',
    };
  }

  const staged: StagedSettlement[] = [];
  let totalGross = 0n;
  let totalFee = 0n;
  let totalNet = 0n;

  const batchId = randomUUID();

  for (const row of pendingByDeveloper) {
    const gross = parseBigInt(row.gross_usdc_micro);
    const fee = calculateFee(gross, feeBps);
    const net = gross - fee;

    totalGross += gross;
    totalFee += fee;
    totalNet += net;
  }

  await pool.query(
    `
      INSERT INTO settlement_batches (
        id,
        from_ts,
        to_ts,
        gross_usdc_micro,
        fee_usdc_micro,
        net_usdc_micro,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'queued')
    `,
    [
      batchId,
      window.from,
      window.to,
      bigintToString(totalGross),
      bigintToString(totalFee),
      bigintToString(totalNet),
    ],
  );

  for (const row of pendingByDeveloper) {
    const gross = parseBigInt(row.gross_usdc_micro);
    const fee = calculateFee(gross, feeBps);
    const net = gross - fee;
    const itemId = randomUUID();

    await pool.query(
      `
        INSERT INTO settlement_items (
          id,
          batch_id,
          developer_id,
          amount_usdc_micro,
          destination_wallet,
          status
        )
        VALUES ($1, $2, $3, $4, $5, 'queued')
      `,
      [itemId, batchId, row.developer_id, bigintToString(net), row.destination_wallet],
    );

    const claimedTransactionIds: string[] = [];
    for (const paymentTransactionId of row.payment_tx_ids) {
      const claimResult = await pool.query(
        `
          UPDATE payment_transactions
          SET settled_batch_id = $1
          WHERE id = $2
            AND settled_batch_id IS NULL
          RETURNING id
        `,
        [batchId, paymentTransactionId],
      );

      if ((claimResult.rowCount ?? 0) > 0) {
        claimedTransactionIds.push(paymentTransactionId);
      }
    }
    if (claimedTransactionIds.length === 0) {
      await pool.query(
        `
          UPDATE settlement_items
          SET status = 'failed'
          WHERE id = $1
        `,
        [itemId],
      );
      continue;
    }

    staged.push({
      itemId,
      developerId: row.developer_id,
      destinationWallet: row.destination_wallet,
      netUsdcMicro: net,
      claimedTransactionIds,
    });
  }

  const payout = options.payout ?? createDefaultSettlementPayoutExecutor(options);

  let failedDevelopers = 0;
  for (const entry of staged) {
    try {
      const payoutResult = await payout({
        destinationWallet: entry.destinationWallet as Address,
        netAmountUsdcMicro: entry.netUsdcMicro,
        developerId: entry.developerId,
        batchId,
      });

      await pool.query(
        `
          UPDATE settlement_items
          SET status = 'confirmed', tx_hash = $1
          WHERE id = $2
        `,
        [payoutResult.txHash, entry.itemId],
      );

      for (const paymentTransactionId of entry.claimedTransactionIds) {
        await pool.query('UPDATE payment_transactions SET settled_at = NOW() WHERE id = $1', [
          paymentTransactionId,
        ]);
      }
    } catch {
      failedDevelopers += 1;

      await pool.query(
        `
          UPDATE settlement_items
          SET status = 'failed'
          WHERE id = $1
        `,
        [entry.itemId],
      );

      for (const paymentTransactionId of entry.claimedTransactionIds) {
        await pool.query(
          'UPDATE payment_transactions SET settled_batch_id = NULL WHERE id = $1 AND settled_at IS NULL',
          [paymentTransactionId],
        );
      }
    }
  }

  const batchStatus = failedDevelopers === 0 ? 'confirmed' : 'failed';
  await pool.query(
    `
      UPDATE settlement_batches
      SET status = $2, confirmed_at = $3
      WHERE id = $1
    `,
    [batchId, batchStatus, failedDevelopers === 0 ? new Date() : null],
  );

  return {
    batchId,
    fromTs: window.from.toISOString(),
    toTs: window.to.toISOString(),
    processedDevelopers: staged.length,
    failedDevelopers,
    totalGrossUsdcMicro: bigintToString(totalGross),
    totalFeeUsdcMicro: bigintToString(totalFee),
    totalNetUsdcMicro: bigintToString(totalNet),
  };
}

export function startSettlementCron(options: SettlementCronOptions = {}): () => void {
  const intervalMs = options.intervalMs ?? ONE_HOUR_MS;
  let running = false;

  const tick = async () => {
    if (running) {
      return;
    }

    running = true;
    try {
      const summary = await runSettlementCycle(options);
      if (summary.batchId) {
        console.info(
          `[settlement] batch ${summary.batchId} processed=${summary.processedDevelopers} failed=${summary.failedDevelopers}`,
        );
      } else {
        console.info('[settlement] no eligible transactions for this cycle');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown settlement error';
      console.error(`[settlement] cycle failed: ${message}`);
    } finally {
      running = false;
    }
  };

  if (options.runOnStart ?? true) {
    void tick();
  }

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  return () => {
    clearInterval(timer);
  };
}

function isExecutedDirectly(): boolean {
  const entryPoint = process.argv[1];
  if (!entryPoint) {
    return false;
  }

  return import.meta.url === pathToFileURL(entryPoint).href;
}

if (isExecutedDirectly()) {
  startSettlementCron();
}
