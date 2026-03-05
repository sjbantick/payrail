import {
  createPublicClient,
  decodeEventLog,
  erc20Abi,
  getAddress,
  http,
  isAddressEqual,
  type Address,
  type Chain,
  type Hex,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';

export type ChainEnv = 'base-mainnet' | 'base-sepolia';

export interface VerifyUsdcPaymentInput {
  txHash: Hex;
  expectedReceiver: Address;
  usdcContract: Address;
  minimumAmountUsdcMicro: bigint;
  minimumConfirmations?: number;
  expectedChainId?: number;
}

export interface VerifyUsdcPaymentOptions {
  chainEnv?: ChainEnv;
  rpcUrl?: string;
  client?: PaymentVerifierClient;
  spentTxStore?: SpentTxStore;
  markSpentOnSuccess?: boolean;
}

type RejectionCode =
  | 'TX_NOT_FOUND'
  | 'TX_FAILED'
  | 'CHAIN_MISMATCH'
  | 'TRANSFER_NOT_FOUND'
  | 'WRONG_RECIPIENT'
  | 'INSUFFICIENT_AMOUNT'
  | 'TX_ALREADY_SPENT'
  | 'INSUFFICIENT_CONFIRMATIONS';

export interface PaymentVerificationSuccess {
  allowed: true;
  code: 'VERIFIED';
  txHash: Hex;
  chainId: number;
  fromWallet: Address;
  toWallet: Address;
  amountUsdcMicro: bigint;
  confirmations: number;
  blockNumber: bigint;
  verifiedAt: Date;
}

export interface PaymentVerificationFailure {
  allowed: false;
  code: RejectionCode;
  message: string;
  txHash: Hex;
  details?: Record<string, unknown>;
}

export type PaymentVerificationResult =
  | PaymentVerificationSuccess
  | PaymentVerificationFailure;

interface TransactionReceiptLike {
  status: 'success' | 'reverted' | string;
  blockNumber: bigint;
  logs: readonly {
    address: Address;
    topics: readonly Hex[];
    data: Hex;
  }[];
}

interface TransactionLike {
  chainId?: bigint | number | null;
}

interface BlockLike {
  timestamp: bigint;
}

export interface PaymentVerifierClient {
  chain?: Pick<Chain, 'id'>;
  getTransactionReceipt(args: { hash: Hex }): Promise<TransactionReceiptLike>;
  getTransaction(args: { hash: Hex }): Promise<TransactionLike>;
  getBlock(args: { blockNumber: bigint }): Promise<BlockLike>;
  getBlockNumber(): Promise<bigint>;
}

export interface SpentTxStore {
  has(txHash: Hex): Promise<boolean>;
  mark(txHash: Hex): Promise<void>;
}

export class InMemorySpentTxStore implements SpentTxStore {
  private readonly spentHashes = new Set<Hex>();

  public async has(txHash: Hex): Promise<boolean> {
    return this.spentHashes.has(txHash);
  }

  public async mark(txHash: Hex): Promise<void> {
    this.spentHashes.add(txHash);
  }
}

const defaultSpentTxStore = new InMemorySpentTxStore();

export function getBaseChainFromEnv(chainEnv: string | undefined = process.env.CHAIN_ENV): Chain {
  if (chainEnv === 'base-mainnet') {
    return base;
  }

  return baseSepolia;
}

export function createBasePublicClient(params?: {
  chainEnv?: ChainEnv;
  chain?: Chain;
  rpcUrl?: string;
}): PaymentVerifierClient {
  const chain = params?.chain ?? getBaseChainFromEnv(params?.chainEnv);
  const rpcUrl = params?.rpcUrl ?? process.env.BASE_RPC_URL ?? chain.rpcUrls.default.http[0];

  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
}

function reject(
  txHash: Hex,
  code: RejectionCode,
  message: string,
  details?: Record<string, unknown>,
): PaymentVerificationFailure {
  return {
    allowed: false,
    code,
    message,
    txHash,
    details,
  };
}

export async function verifyUsdcPayment(
  input: VerifyUsdcPaymentInput,
  options: VerifyUsdcPaymentOptions = {},
): Promise<PaymentVerificationResult> {
  const chain = getBaseChainFromEnv(options.chainEnv);
  const client = options.client ?? createBasePublicClient({ chain, rpcUrl: options.rpcUrl });
  const spentTxStore = options.spentTxStore ?? defaultSpentTxStore;
  const expectedChainId = input.expectedChainId ?? chain.id;

  if (client.chain?.id !== undefined && client.chain.id !== expectedChainId) {
    return reject(input.txHash, 'CHAIN_MISMATCH', 'Transaction was submitted to a different chain.', {
      expectedChainId,
      observedChainId: client.chain.id,
    });
  }

  if (await spentTxStore.has(input.txHash)) {
    return reject(input.txHash, 'TX_ALREADY_SPENT', 'Transaction hash has already been used.');
  }

  let transaction: TransactionLike;
  let receipt: TransactionReceiptLike;

  try {
    transaction = await client.getTransaction({ hash: input.txHash });
    receipt = await client.getTransactionReceipt({ hash: input.txHash });
  } catch {
    return reject(input.txHash, 'TX_NOT_FOUND', 'Transaction hash was not found on chain.');
  }

  if (transaction.chainId != null && Number(transaction.chainId) !== expectedChainId) {
    return reject(input.txHash, 'CHAIN_MISMATCH', 'Transaction was submitted to a different chain.', {
      expectedChainId,
      observedChainId: Number(transaction.chainId),
    });
  }

  if (receipt.status !== 'success') {
    return reject(input.txHash, 'TX_FAILED', 'Transaction was found but execution failed.');
  }

  const minimumConfirmations = input.minimumConfirmations ?? 1;
  const latestBlockNumber = await client.getBlockNumber();
  const confirmationsBigInt = latestBlockNumber - receipt.blockNumber + 1n;
  const confirmations = Number(confirmationsBigInt > 0n ? confirmationsBigInt : 0n);

  if (confirmations < minimumConfirmations) {
    return reject(
      input.txHash,
      'INSUFFICIENT_CONFIRMATIONS',
      'Transaction has not reached required confirmations.',
      {
        required: minimumConfirmations,
        observed: confirmations,
      },
    );
  }

  const expectedReceiver = getAddress(input.expectedReceiver);
  const usdcContract = getAddress(input.usdcContract);

  let sawTokenTransfer = false;
  let sawWrongReceiverTransfer = false;
  let bestTransfer:
    | {
        from: Address;
        to: Address;
        value: bigint;
      }
    | undefined;

  for (const log of receipt.logs) {
    if (!isAddressEqual(log.address, usdcContract)) {
      continue;
    }

    if (log.topics.length === 0) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: erc20Abi,
        topics: [...log.topics] as [Hex, ...Hex[]],
        data: log.data,
      });

      if (decoded.eventName !== 'Transfer') {
        continue;
      }

      sawTokenTransfer = true;

      const from = getAddress(decoded.args.from);
      const to = getAddress(decoded.args.to);
      const value = decoded.args.value;

      if (!isAddressEqual(to, expectedReceiver)) {
        sawWrongReceiverTransfer = true;
        continue;
      }

      if (!bestTransfer || value > bestTransfer.value) {
        bestTransfer = { from, to, value };
      }
    } catch {
      continue;
    }
  }

  if (!bestTransfer) {
    if (sawWrongReceiverTransfer) {
      return reject(
        input.txHash,
        'WRONG_RECIPIENT',
        'USDC transfer was detected but recipient wallet did not match.',
        { expectedReceiver },
      );
    }

    return reject(
      input.txHash,
      'TRANSFER_NOT_FOUND',
      sawTokenTransfer
        ? 'USDC transfer event could not be decoded for the transaction.'
        : 'No USDC transfer was detected for this transaction.',
      { usdcContract },
    );
  }

  if (bestTransfer.value < input.minimumAmountUsdcMicro) {
    return reject(input.txHash, 'INSUFFICIENT_AMOUNT', 'USDC transfer amount is below required price.', {
      requiredAmountUsdcMicro: input.minimumAmountUsdcMicro.toString(),
      observedAmountUsdcMicro: bestTransfer.value.toString(),
    });
  }

  const block = await client.getBlock({ blockNumber: receipt.blockNumber });

  if (options.markSpentOnSuccess ?? true) {
    await spentTxStore.mark(input.txHash);
  }

  return {
    allowed: true,
    code: 'VERIFIED',
    txHash: input.txHash,
    chainId: expectedChainId,
    fromWallet: bestTransfer.from,
    toWallet: bestTransfer.to,
    amountUsdcMicro: bestTransfer.value,
    confirmations,
    blockNumber: receipt.blockNumber,
    verifiedAt: new Date(Number(block.timestamp) * 1000),
  };
}
