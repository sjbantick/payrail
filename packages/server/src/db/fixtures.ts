import { createHash, randomUUID } from 'node:crypto';

import {
  createApiEndpoint,
  createApiKey,
  createDeveloper,
  createPaymentIntent,
  type ApiEndpoint,
  type ApiKey,
  type Developer,
  type PaymentIntent,
  type Queryable,
} from './models.js';

export interface SeedDevFixturesInput {
  developerName?: string;
  developerEmail?: string;
  upstreamUrl?: string;
  endpointSlug?: string;
  receiverWallet?: string;
  pricePerCallUsdcMicro?: bigint;
  plaintextApiKey?: string;
}

export interface SeedDevFixturesResult {
  developer: Developer;
  endpoint: ApiEndpoint;
  apiKey: ApiKey;
  paymentIntent: PaymentIntent;
  plaintextApiKey: string;
}

function hashApiKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function seedDevFixtures(
  db: Queryable,
  input: SeedDevFixturesInput = {},
): Promise<SeedDevFixturesResult> {
  const developer = await createDeveloper(db, {
    id: randomUUID(),
    name: input.developerName ?? 'PayRail Demo Developer',
    email: input.developerEmail ?? 'demo@payrail.dev',
    defaultPayoutWallet: input.receiverWallet ?? '0x1111111111111111111111111111111111111111',
  });

  const endpoint = await createApiEndpoint(db, {
    id: randomUUID(),
    developerId: developer.id,
    slug: input.endpointSlug ?? `demo-endpoint-${developer.id.slice(0, 8)}`,
    upstreamUrl: input.upstreamUrl ?? 'https://api.example.com/v1/paid/forecast',
    pricePerCallUsdcMicro: input.pricePerCallUsdcMicro ?? 1000n,
    receiverWallet: input.receiverWallet ?? developer.defaultPayoutWallet,
  });

  const plaintextApiKey =
    input.plaintextApiKey ?? `payrail_dev_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

  const apiKey = await createApiKey(db, {
    id: randomUUID(),
    developerId: developer.id,
    keyHash: hashApiKey(plaintextApiKey),
    label: 'Default dev key',
  });

  const paymentIntent = await createPaymentIntent(db, {
    id: randomUUID(),
    endpointId: endpoint.id,
    idempotencyKey: `seed-${endpoint.id.slice(0, 8)}`,
    requiredAmountUsdcMicro: input.pricePerCallUsdcMicro ?? 1000n,
    status: 'pending',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  return {
    developer,
    endpoint,
    apiKey,
    paymentIntent,
    plaintextApiKey,
  };
}
