import { randomUUID } from 'node:crypto';

import type { QueryResult, QueryResultRow } from 'pg';

export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

export type PaymentIntentStatus = 'pending' | 'verified' | 'expired' | 'failed';
export type PaymentTransactionStatus = 'observed' | 'verified' | 'rejected';
export type MeterEventStatus = 'accepted' | 'rejected' | 'error';
export type SettlementBatchStatus = 'draft' | 'queued' | 'submitted' | 'confirmed' | 'failed';
export type SettlementItemStatus = 'queued' | 'submitted' | 'confirmed' | 'failed';

interface DeveloperRow {
  id: string;
  name: string;
  email: string | null;
  default_payout_wallet: string;
  status: string;
  created_at: Date;
}

interface ApiEndpointRow {
  id: string;
  developer_id: string;
  slug: string;
  upstream_url: string;
  price_per_call_usdc_micro: string;
  receiver_wallet: string;
  auth_mode: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface ApiKeyRow {
  id: string;
  developer_id: string;
  key_hash: string;
  label: string | null;
  status: string;
  created_at: Date;
  last_used_at: Date | null;
}

interface PaymentIntentRow {
  id: string;
  endpoint_id: string;
  idempotency_key: string | null;
  required_amount_usdc_micro: string;
  status: PaymentIntentStatus;
  expires_at: Date;
  created_at: Date;
}

interface PaymentTransactionRow {
  id: string;
  payment_intent_id: string | null;
  tx_hash: string;
  chain_id: string;
  token_contract: string;
  from_wallet: string;
  to_wallet: string;
  amount_usdc_micro: string;
  block_number: string;
  confirmations: number;
  verified_at: Date | null;
  status: PaymentTransactionStatus;
  rejection_reason: string | null;
  created_at: Date;
}

interface MeterEventRow {
  id: string;
  endpoint_id: string;
  payment_intent_id: string | null;
  payment_transaction_id: string | null;
  request_id: string;
  client_id: string | null;
  units: string;
  unit_price_usdc_micro: string;
  total_price_usdc_micro: string;
  status: MeterEventStatus;
  reject_code: string | null;
  latency_ms: number | null;
  created_at: Date;
}

interface SettlementBatchRow {
  id: string;
  from_ts: Date;
  to_ts: Date;
  gross_usdc_micro: string;
  fee_usdc_micro: string;
  net_usdc_micro: string;
  status: SettlementBatchStatus;
  submit_tx_hash: string | null;
  created_at: Date;
  confirmed_at: Date | null;
}

interface SettlementItemRow {
  id: string;
  batch_id: string;
  developer_id: string;
  amount_usdc_micro: string;
  destination_wallet: string;
  status: SettlementItemStatus;
  tx_hash: string | null;
  created_at: Date;
}

export interface Developer {
  id: string;
  name: string;
  email: string | null;
  defaultPayoutWallet: string;
  status: string;
  createdAt: Date;
}

export interface ApiEndpoint {
  id: string;
  developerId: string;
  slug: string;
  upstreamUrl: string;
  pricePerCallUsdcMicro: string;
  receiverWallet: string;
  authMode: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKey {
  id: string;
  developerId: string;
  keyHash: string;
  label: string | null;
  status: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface PaymentIntent {
  id: string;
  endpointId: string;
  idempotencyKey: string | null;
  requiredAmountUsdcMicro: string;
  status: PaymentIntentStatus;
  expiresAt: Date;
  createdAt: Date;
}

export interface PaymentTransaction {
  id: string;
  paymentIntentId: string | null;
  txHash: string;
  chainId: string;
  tokenContract: string;
  fromWallet: string;
  toWallet: string;
  amountUsdcMicro: string;
  blockNumber: string;
  confirmations: number;
  verifiedAt: Date | null;
  status: PaymentTransactionStatus;
  rejectionReason: string | null;
  createdAt: Date;
}

export interface MeterEvent {
  id: string;
  endpointId: string;
  paymentIntentId: string | null;
  paymentTransactionId: string | null;
  requestId: string;
  clientId: string | null;
  units: string;
  unitPriceUsdcMicro: string;
  totalPriceUsdcMicro: string;
  status: MeterEventStatus;
  rejectCode: string | null;
  latencyMs: number | null;
  createdAt: Date;
}

export interface SettlementBatch {
  id: string;
  fromTs: Date;
  toTs: Date;
  grossUsdcMicro: string;
  feeUsdcMicro: string;
  netUsdcMicro: string;
  status: SettlementBatchStatus;
  submitTxHash: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
}

export interface SettlementItem {
  id: string;
  batchId: string;
  developerId: string;
  amountUsdcMicro: string;
  destinationWallet: string;
  status: SettlementItemStatus;
  txHash: string | null;
  createdAt: Date;
}

export interface CreateDeveloperInput {
  id?: string;
  name: string;
  email?: string | null;
  defaultPayoutWallet: string;
  status?: string;
}

export interface CreateApiEndpointInput {
  id?: string;
  developerId: string;
  slug: string;
  upstreamUrl: string;
  pricePerCallUsdcMicro: bigint;
  receiverWallet: string;
  authMode?: string;
  status?: string;
}

export interface CreateApiKeyInput {
  id?: string;
  developerId: string;
  keyHash: string;
  label?: string | null;
  status?: string;
}

export interface CreatePaymentIntentInput {
  id?: string;
  endpointId: string;
  idempotencyKey?: string | null;
  requiredAmountUsdcMicro: bigint;
  status?: PaymentIntentStatus;
  expiresAt: Date;
}

export interface CreatePaymentTransactionInput {
  id?: string;
  paymentIntentId?: string | null;
  txHash: string;
  chainId: bigint;
  tokenContract: string;
  fromWallet: string;
  toWallet: string;
  amountUsdcMicro: bigint;
  blockNumber: bigint;
  confirmations: number;
  verifiedAt?: Date | null;
  status: PaymentTransactionStatus;
  rejectionReason?: string | null;
}

export interface CreateMeterEventInput {
  id?: string;
  endpointId: string;
  paymentIntentId?: string | null;
  paymentTransactionId?: string | null;
  requestId: string;
  clientId?: string | null;
  units: bigint;
  unitPriceUsdcMicro: bigint;
  totalPriceUsdcMicro: bigint;
  status: MeterEventStatus;
  rejectCode?: string | null;
  latencyMs?: number | null;
}

export interface CreateSettlementBatchInput {
  id?: string;
  fromTs: Date;
  toTs: Date;
  grossUsdcMicro: bigint;
  feeUsdcMicro: bigint;
  netUsdcMicro: bigint;
  status?: SettlementBatchStatus;
  submitTxHash?: string | null;
  confirmedAt?: Date | null;
}

export interface CreateSettlementItemInput {
  id?: string;
  batchId: string;
  developerId: string;
  amountUsdcMicro: bigint;
  destinationWallet: string;
  status?: SettlementItemStatus;
  txHash?: string | null;
}

const INSERT_DEVELOPER_SQL = `
  INSERT INTO developers (
    id,
    name,
    email,
    default_payout_wallet,
    status
  )
  VALUES ($1, $2, $3, $4, $5)
  RETURNING id, name, email, default_payout_wallet, status, created_at
`;

const INSERT_API_ENDPOINT_SQL = `
  INSERT INTO api_endpoints (
    id,
    developer_id,
    slug,
    upstream_url,
    price_per_call_usdc_micro,
    receiver_wallet,
    auth_mode,
    status
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  RETURNING
    id,
    developer_id,
    slug,
    upstream_url,
    price_per_call_usdc_micro,
    receiver_wallet,
    auth_mode,
    status,
    created_at,
    updated_at
`;

const INSERT_API_KEY_SQL = `
  INSERT INTO api_keys (
    id,
    developer_id,
    key_hash,
    label,
    status
  )
  VALUES ($1, $2, $3, $4, $5)
  RETURNING id, developer_id, key_hash, label, status, created_at, last_used_at
`;

const INSERT_PAYMENT_INTENT_SQL = `
  INSERT INTO payment_intents (
    id,
    endpoint_id,
    idempotency_key,
    required_amount_usdc_micro,
    status,
    expires_at
  )
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING
    id,
    endpoint_id,
    idempotency_key,
    required_amount_usdc_micro,
    status,
    expires_at,
    created_at
`;

const INSERT_PAYMENT_TRANSACTION_SQL = `
  INSERT INTO payment_transactions (
    id,
    payment_intent_id,
    tx_hash,
    chain_id,
    token_contract,
    from_wallet,
    to_wallet,
    amount_usdc_micro,
    block_number,
    confirmations,
    verified_at,
    status,
    rejection_reason
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
  RETURNING
    id,
    payment_intent_id,
    tx_hash,
    chain_id,
    token_contract,
    from_wallet,
    to_wallet,
    amount_usdc_micro,
    block_number,
    confirmations,
    verified_at,
    status,
    rejection_reason,
    created_at
`;

const INSERT_METER_EVENT_SQL = `
  INSERT INTO meter_events (
    id,
    endpoint_id,
    payment_intent_id,
    payment_transaction_id,
    request_id,
    client_id,
    units,
    unit_price_usdc_micro,
    total_price_usdc_micro,
    status,
    reject_code,
    latency_ms
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  RETURNING
    id,
    endpoint_id,
    payment_intent_id,
    payment_transaction_id,
    request_id,
    client_id,
    units,
    unit_price_usdc_micro,
    total_price_usdc_micro,
    status,
    reject_code,
    latency_ms,
    created_at
`;

const INSERT_SETTLEMENT_BATCH_SQL = `
  INSERT INTO settlement_batches (
    id,
    from_ts,
    to_ts,
    gross_usdc_micro,
    fee_usdc_micro,
    net_usdc_micro,
    status,
    submit_tx_hash,
    confirmed_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  RETURNING
    id,
    from_ts,
    to_ts,
    gross_usdc_micro,
    fee_usdc_micro,
    net_usdc_micro,
    status,
    submit_tx_hash,
    created_at,
    confirmed_at
`;

const INSERT_SETTLEMENT_ITEM_SQL = `
  INSERT INTO settlement_items (
    id,
    batch_id,
    developer_id,
    amount_usdc_micro,
    destination_wallet,
    status,
    tx_hash
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  RETURNING id, batch_id, developer_id, amount_usdc_micro, destination_wallet, status, tx_hash, created_at
`;

const SELECT_ENDPOINT_BY_SLUG_SQL = `
  SELECT
    id,
    developer_id,
    slug,
    upstream_url,
    price_per_call_usdc_micro,
    receiver_wallet,
    auth_mode,
    status,
    created_at,
    updated_at
  FROM api_endpoints
  WHERE slug = $1
  LIMIT 1
`;

function toBigIntString(value: bigint): string {
  return value.toString();
}

function mapDeveloper(row: DeveloperRow): Developer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    defaultPayoutWallet: row.default_payout_wallet,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapApiEndpoint(row: ApiEndpointRow): ApiEndpoint {
  return {
    id: row.id,
    developerId: row.developer_id,
    slug: row.slug,
    upstreamUrl: row.upstream_url,
    pricePerCallUsdcMicro: row.price_per_call_usdc_micro,
    receiverWallet: row.receiver_wallet,
    authMode: row.auth_mode,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    developerId: row.developer_id,
    keyHash: row.key_hash,
    label: row.label,
    status: row.status,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

function mapPaymentIntent(row: PaymentIntentRow): PaymentIntent {
  return {
    id: row.id,
    endpointId: row.endpoint_id,
    idempotencyKey: row.idempotency_key,
    requiredAmountUsdcMicro: row.required_amount_usdc_micro,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function mapPaymentTransaction(row: PaymentTransactionRow): PaymentTransaction {
  return {
    id: row.id,
    paymentIntentId: row.payment_intent_id,
    txHash: row.tx_hash,
    chainId: row.chain_id,
    tokenContract: row.token_contract,
    fromWallet: row.from_wallet,
    toWallet: row.to_wallet,
    amountUsdcMicro: row.amount_usdc_micro,
    blockNumber: row.block_number,
    confirmations: row.confirmations,
    verifiedAt: row.verified_at,
    status: row.status,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
  };
}

function mapMeterEvent(row: MeterEventRow): MeterEvent {
  return {
    id: row.id,
    endpointId: row.endpoint_id,
    paymentIntentId: row.payment_intent_id,
    paymentTransactionId: row.payment_transaction_id,
    requestId: row.request_id,
    clientId: row.client_id,
    units: row.units,
    unitPriceUsdcMicro: row.unit_price_usdc_micro,
    totalPriceUsdcMicro: row.total_price_usdc_micro,
    status: row.status,
    rejectCode: row.reject_code,
    latencyMs: row.latency_ms,
    createdAt: row.created_at,
  };
}

function mapSettlementBatch(row: SettlementBatchRow): SettlementBatch {
  return {
    id: row.id,
    fromTs: row.from_ts,
    toTs: row.to_ts,
    grossUsdcMicro: row.gross_usdc_micro,
    feeUsdcMicro: row.fee_usdc_micro,
    netUsdcMicro: row.net_usdc_micro,
    status: row.status,
    submitTxHash: row.submit_tx_hash,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
  };
}

function mapSettlementItem(row: SettlementItemRow): SettlementItem {
  return {
    id: row.id,
    batchId: row.batch_id,
    developerId: row.developer_id,
    amountUsdcMicro: row.amount_usdc_micro,
    destinationWallet: row.destination_wallet,
    status: row.status,
    txHash: row.tx_hash,
    createdAt: row.created_at,
  };
}

export async function createDeveloper(db: Queryable, input: CreateDeveloperInput): Promise<Developer> {
  const result = await db.query<DeveloperRow>(INSERT_DEVELOPER_SQL, [
    input.id ?? randomUUID(),
    input.name,
    input.email ?? null,
    input.defaultPayoutWallet,
    input.status ?? 'active',
  ]);

  return mapDeveloper(result.rows[0]);
}

export async function createApiEndpoint(db: Queryable, input: CreateApiEndpointInput): Promise<ApiEndpoint> {
  const result = await db.query<ApiEndpointRow>(INSERT_API_ENDPOINT_SQL, [
    input.id ?? randomUUID(),
    input.developerId,
    input.slug,
    input.upstreamUrl,
    toBigIntString(input.pricePerCallUsdcMicro),
    input.receiverWallet,
    input.authMode ?? 'api_key',
    input.status ?? 'active',
  ]);

  return mapApiEndpoint(result.rows[0]);
}

export async function createApiKey(db: Queryable, input: CreateApiKeyInput): Promise<ApiKey> {
  const result = await db.query<ApiKeyRow>(INSERT_API_KEY_SQL, [
    input.id ?? randomUUID(),
    input.developerId,
    input.keyHash,
    input.label ?? null,
    input.status ?? 'active',
  ]);

  return mapApiKey(result.rows[0]);
}

export async function createPaymentIntent(db: Queryable, input: CreatePaymentIntentInput): Promise<PaymentIntent> {
  const result = await db.query<PaymentIntentRow>(INSERT_PAYMENT_INTENT_SQL, [
    input.id ?? randomUUID(),
    input.endpointId,
    input.idempotencyKey ?? null,
    toBigIntString(input.requiredAmountUsdcMicro),
    input.status ?? 'pending',
    input.expiresAt,
  ]);

  return mapPaymentIntent(result.rows[0]);
}

export async function createPaymentTransaction(
  db: Queryable,
  input: CreatePaymentTransactionInput,
): Promise<PaymentTransaction> {
  const result = await db.query<PaymentTransactionRow>(INSERT_PAYMENT_TRANSACTION_SQL, [
    input.id ?? randomUUID(),
    input.paymentIntentId ?? null,
    input.txHash,
    toBigIntString(input.chainId),
    input.tokenContract,
    input.fromWallet,
    input.toWallet,
    toBigIntString(input.amountUsdcMicro),
    toBigIntString(input.blockNumber),
    input.confirmations,
    input.verifiedAt ?? null,
    input.status,
    input.rejectionReason ?? null,
  ]);

  return mapPaymentTransaction(result.rows[0]);
}

export async function createMeterEvent(db: Queryable, input: CreateMeterEventInput): Promise<MeterEvent> {
  const result = await db.query<MeterEventRow>(INSERT_METER_EVENT_SQL, [
    input.id ?? randomUUID(),
    input.endpointId,
    input.paymentIntentId ?? null,
    input.paymentTransactionId ?? null,
    input.requestId,
    input.clientId ?? null,
    toBigIntString(input.units),
    toBigIntString(input.unitPriceUsdcMicro),
    toBigIntString(input.totalPriceUsdcMicro),
    input.status,
    input.rejectCode ?? null,
    input.latencyMs ?? null,
  ]);

  return mapMeterEvent(result.rows[0]);
}

export async function createSettlementBatch(
  db: Queryable,
  input: CreateSettlementBatchInput,
): Promise<SettlementBatch> {
  const result = await db.query<SettlementBatchRow>(INSERT_SETTLEMENT_BATCH_SQL, [
    input.id ?? randomUUID(),
    input.fromTs,
    input.toTs,
    toBigIntString(input.grossUsdcMicro),
    toBigIntString(input.feeUsdcMicro),
    toBigIntString(input.netUsdcMicro),
    input.status ?? 'draft',
    input.submitTxHash ?? null,
    input.confirmedAt ?? null,
  ]);

  return mapSettlementBatch(result.rows[0]);
}

export async function createSettlementItem(db: Queryable, input: CreateSettlementItemInput): Promise<SettlementItem> {
  const result = await db.query<SettlementItemRow>(INSERT_SETTLEMENT_ITEM_SQL, [
    input.id ?? randomUUID(),
    input.batchId,
    input.developerId,
    toBigIntString(input.amountUsdcMicro),
    input.destinationWallet,
    input.status ?? 'queued',
    input.txHash ?? null,
  ]);

  return mapSettlementItem(result.rows[0]);
}

export async function findApiEndpointBySlug(db: Queryable, slug: string): Promise<ApiEndpoint | null> {
  const result = await db.query<ApiEndpointRow>(SELECT_ENDPOINT_BY_SLUG_SQL, [slug]);
  if (result.rowCount === 0) {
    return null;
  }

  return mapApiEndpoint(result.rows[0]);
}
