import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeAbiParameters, encodeEventTopics, getAddress, type Address, type Hex, erc20Abi } from 'viem';

import {
  InMemorySpentTxStore,
  type PaymentVerifierClient,
  verifyUsdcPayment,
} from './verifier.js';

function buildTransferLog(args: {
  tokenAddress: Address;
  from: Address;
  to: Address;
  value: bigint;
}) {
  const topics = encodeEventTopics({
    abi: erc20Abi,
    eventName: 'Transfer',
    args: {
      from: args.from,
      to: args.to,
    },
  }) as Hex[];

  const data = encodeAbiParameters([{ type: 'uint256' }], [args.value]);

  return {
    address: args.tokenAddress,
    topics,
    data,
  };
}

function createMockClient(params: {
  chainId?: number;
  blockNumber?: bigint;
  latestBlockNumber?: bigint;
  txChainId?: bigint;
  receiptStatus?: 'success' | 'reverted';
  logs?: ReturnType<typeof buildTransferLog>[];
}): PaymentVerifierClient {
  return {
    chain: {
      id: params.chainId ?? 84532,
    },
    async getTransaction() {
      return {
        chainId: params.txChainId ?? BigInt(params.chainId ?? 84532),
      };
    },
    async getTransactionReceipt() {
      return {
        status: params.receiptStatus ?? 'success',
        blockNumber: params.blockNumber ?? 1000n,
        logs: params.logs ?? [],
      };
    },
    async getBlock() {
      return {
        timestamp: 1_700_000_000n,
      };
    },
    async getBlockNumber() {
      return params.latestBlockNumber ?? 1005n;
    },
  };
}

const txHash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
const usdcContract = getAddress('0x036CbD53842c5426634e7929541eC2318f3dCf7e');
const sender = getAddress('0x1111111111111111111111111111111111111111');
const receiver = getAddress('0x2222222222222222222222222222222222222222');
const wrongReceiver = getAddress('0x3333333333333333333333333333333333333333');

test('verifyUsdcPayment accepts valid USDC transfer', async () => {
  const client = createMockClient({
    logs: [
      buildTransferLog({
        tokenAddress: usdcContract,
        from: sender,
        to: receiver,
        value: 10_000n,
      }),
    ],
  });

  const result = await verifyUsdcPayment(
    {
      txHash,
      expectedReceiver: receiver,
      usdcContract,
      minimumAmountUsdcMicro: 1_000n,
    },
    {
      client,
      markSpentOnSuccess: false,
    },
  );

  assert.equal(result.allowed, true);
  if (result.allowed) {
    assert.equal(result.code, 'VERIFIED');
    assert.equal(result.amountUsdcMicro, 10_000n);
    assert.equal(result.toWallet, receiver);
  }
});

test('verifyUsdcPayment rejects chain mismatch', async () => {
  const client = createMockClient({ chainId: 8453 });

  const result = await verifyUsdcPayment(
    {
      txHash,
      expectedReceiver: receiver,
      usdcContract,
      minimumAmountUsdcMicro: 1_000n,
      expectedChainId: 84532,
    },
    { client },
  );

  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.code, 'CHAIN_MISMATCH');
  }
});

test('verifyUsdcPayment rejects wrong receiver', async () => {
  const client = createMockClient({
    logs: [
      buildTransferLog({
        tokenAddress: usdcContract,
        from: sender,
        to: wrongReceiver,
        value: 10_000n,
      }),
    ],
  });

  const result = await verifyUsdcPayment(
    {
      txHash,
      expectedReceiver: receiver,
      usdcContract,
      minimumAmountUsdcMicro: 1_000n,
    },
    {
      client,
      markSpentOnSuccess: false,
    },
  );

  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.code, 'WRONG_RECIPIENT');
  }
});

test('verifyUsdcPayment rejects insufficient amount', async () => {
  const client = createMockClient({
    logs: [
      buildTransferLog({
        tokenAddress: usdcContract,
        from: sender,
        to: receiver,
        value: 500n,
      }),
    ],
  });

  const result = await verifyUsdcPayment(
    {
      txHash,
      expectedReceiver: receiver,
      usdcContract,
      minimumAmountUsdcMicro: 1_000n,
    },
    {
      client,
      markSpentOnSuccess: false,
    },
  );

  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.code, 'INSUFFICIENT_AMOUNT');
  }
});

test('verifyUsdcPayment enforces replay protection via spent store', async () => {
  const spentStore = new InMemorySpentTxStore();
  const client = createMockClient({
    logs: [
      buildTransferLog({
        tokenAddress: usdcContract,
        from: sender,
        to: receiver,
        value: 10_000n,
      }),
    ],
  });

  const first = await verifyUsdcPayment(
    {
      txHash,
      expectedReceiver: receiver,
      usdcContract,
      minimumAmountUsdcMicro: 1_000n,
    },
    { client, spentTxStore: spentStore },
  );

  assert.equal(first.allowed, true);

  const second = await verifyUsdcPayment(
    {
      txHash,
      expectedReceiver: receiver,
      usdcContract,
      minimumAmountUsdcMicro: 1_000n,
    },
    { client, spentTxStore: spentStore },
  );

  assert.equal(second.allowed, false);
  if (!second.allowed) {
    assert.equal(second.code, 'TX_ALREADY_SPENT');
  }
});
