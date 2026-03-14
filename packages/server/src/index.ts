import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { Pool } from 'pg';
import { z } from 'zod';

import { registerApiKeyRoutes } from './api-keys.js';
import { registerApiEndpointRoutes } from './api-endpoints.js';
import { runMigrations } from './db/migrate.js';
import {
  createVerifyAndMeterHandler,
  processVerifyAndMeter,
  type VerifyAndMeterDependencies,
} from './verify-and-meter.js';
import { startSettlementCron } from './settlement.js';

// Demo endpoint — fixed UUID seeded at startup via seedDemoEndpoint()
export const DEMO_ENDPOINT_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_ENDPOINT_SLUG = 'demo';
const DEMO_PRICE_USDC_MICRO = 1000; // 0.001 USDC
const DEMO_FACTS = [
  'Honey never spoils — archaeologists found 3,000-year-old honey in Egyptian tombs that was still edible.',
  'A group of flamingos is called a flamboyance.',
  'Octopuses have three hearts and blue blood.',
  'The shortest war in history lasted 38 minutes (Anglo-Zanzibar War, 1896).',
  'A single strand of spaghetti is called a spaghetto.',
  'Wombat droppings are cube-shaped.',
  'The Eiffel Tower grows about 15 cm taller in summer due to thermal expansion.',
  "Scotland's national animal is the unicorn.",
  'A day on Venus is longer than a year on Venus.',
  'Bananas are berries. Strawberries are not.',
];

const serverEnvSchema = z.object({
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required.' })
    .min(1, 'DATABASE_URL is required.'),
  USDC_CONTRACT_ADDRESS: z
    .string({ required_error: 'USDC_CONTRACT_ADDRESS is required.' })
    .regex(/^0x[0-9a-fA-F]{40}$/, 'USDC_CONTRACT_ADDRESS must be a 20-byte hex address.'),
  HOST: z
    .string()
    .trim()
    .min(1, 'HOST cannot be empty.')
    .default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  ADMIN_API_KEY: z.string().optional(),
  DEMO_RECEIVER_WALLET: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),
  SETTLEMENT_SIGNER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse(env);
  if (parsed.success) {
    return parsed.data;
  }

  const details = parsed.error.issues
    .map((issue) => {
      const field = issue.path.join('.') || 'env';
      return `${field}: ${issue.message}`;
    })
    .join('\n');

  throw new Error(`Invalid server environment configuration:\n${details}`);
}

interface UsageRow {
  api_key: string;
  request_count: string;
  total_usdc_micro: string;
  first_request_at: Date;
  last_request_at: Date;
}

async function seedDemoEndpoint(pool: Pool, receiverWallet: string): Promise<void> {
  await pool.query(
    `
      INSERT INTO api_endpoints (id, developer_id, slug, upstream_url, price_per_call_usdc_micro, receiver_wallet, auth_mode, status)
      VALUES ($1, NULL, $2, 'demo', $3, $4, 'api_key', 'active')
      ON CONFLICT (id) DO UPDATE
        SET receiver_wallet = EXCLUDED.receiver_wallet,
            price_per_call_usdc_micro = EXCLUDED.price_per_call_usdc_micro,
            updated_at = NOW()
    `,
    [DEMO_ENDPOINT_ID, DEMO_ENDPOINT_SLUG, DEMO_PRICE_USDC_MICRO, receiverWallet],
  );
}

export function createApp(options: VerifyAndMeterDependencies = {}) {
  const app = new Hono();

  app.get('/health', (c) => {
    return c.json({ ok: true });
  });

  registerApiKeyRoutes(app, {
    pool: options.pool as never,
  });

  registerApiEndpointRoutes(app, {
    pool: options.pool as never,
  });

  app.post('/v1/verify-and-meter', createVerifyAndMeterHandler(options));

  // Live demo endpoint — costs 0.001 USDC, returns a random fun fact.
  // POST /v1/demo { requestId?, payment: { txHash, chainId, token }, apiKey? }
  app.post('/v1/demo', async (c) => {
    let body: Record<string, unknown> = {};
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      // body stays empty
    }

    const requestId =
      typeof body.requestId === 'string' ? body.requestId : randomUUID();
    const payment = body.payment;

    if (
      !payment ||
      typeof payment !== 'object' ||
      typeof (payment as Record<string, unknown>).txHash !== 'string'
    ) {
      const receiverWallet =
        process.env.DEMO_RECEIVER_WALLET ?? '0x0000000000000000000000000000000000000001';
      return c.json(
        {
          error: 'PAYMENT_REQUIRED',
          message: 'Send 0.001 USDC to receive a random fun fact.',
          paymentInstructions: {
            chainId: 84532,
            receiver: receiverWallet,
            requiredUsdcMicro: DEMO_PRICE_USDC_MICRO,
            token: 'USDC',
            note: `Send 0.001 USDC to ${receiverWallet} on Base Sepolia (chainId 84532), then POST back with: { "requestId": "<unique>", "payment": { "txHash": "0x...", "chainId": 84532, "token": "USDC" } }`,
          },
        },
        402,
      );
    }

    const payload = {
      endpointId: DEMO_ENDPOINT_ID,
      requestId,
      payment: payment as { txHash: string; chainId: number; token: string },
      usage: { units: 1 },
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
    };

    try {
      const result = await processVerifyAndMeter(payload, options);

      if (result.allowed) {
        c.header('x-payrail-charged', String(result.chargedUsdcMicro));
        const fact = DEMO_FACTS[Math.floor(Math.random() * DEMO_FACTS.length)];
        return c.json({
          allowed: true,
          fact,
          chargedUsdcMicro: result.chargedUsdcMicro,
          meterEventId: result.meterEventId,
        });
      }

      return c.json(result, 402);
    } catch (error) {
      const isEndpointNotFound =
        error instanceof Error &&
        (error as NodeJS.ErrnoException).code === 'ENDPOINT_NOT_FOUND';

      if (isEndpointNotFound) {
        return c.json(
          { error: 'Demo endpoint not configured. Set DEMO_RECEIVER_WALLET and restart.' },
          503,
        );
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(JSON.stringify({ event: 'demo_error', requestId, error: message }));
      return c.json({ error: 'Demo request failed.', message: 'An internal error occurred.' }, 500);
    }
  });

  // Usage stats for an API key — reads from meter_events (live data).
  app.get('/api/usage/:apiKey', async (c) => {
    const pool = (options.pool as unknown as Pool) ??
      new Pool({ connectionString: process.env.DATABASE_URL });
    const apiKey = c.req.param('apiKey');

    try {
      const result = await pool.query<UsageRow>(
        `
          SELECT
            api_key,
            COUNT(*)::text AS request_count,
            COALESCE(SUM(total_price_usdc_micro), 0)::text AS total_usdc_micro,
            MIN(created_at) AS first_request_at,
            MAX(created_at) AS last_request_at
          FROM meter_events
          WHERE api_key = $1 AND status = 'accepted'
          GROUP BY api_key
        `,
        [apiKey],
      );

      if (result.rowCount === 0) {
        return c.json({ error: 'No usage found for this API key.' }, 404);
      }

      const row = result.rows[0];
      return c.json({
        apiKey: row.api_key,
        requestCount: Number(row.request_count),
        totalUsdcMicro: row.total_usdc_micro,
        firstRequestAt: row.first_request_at.toISOString(),
        lastRequestAt: row.last_request_at.toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return c.json({ error: 'Failed to load usage.', message }, 500);
    }
  });

  return app;
}

const app = createApp();

export default app;

export function startServer(env = process.env) {
  const config = parseServerEnv(env);

  const pool = new Pool({ connectionString: config.DATABASE_URL });

  runMigrations()
    .then(() => {
      const receiverWallet =
        config.DEMO_RECEIVER_WALLET ?? '0x0000000000000000000000000000000000000001';
      if (!config.DEMO_RECEIVER_WALLET) {
        console.warn('[demo] DEMO_RECEIVER_WALLET not set — using placeholder wallet 0x000...001');
      }

      return seedDemoEndpoint(pool, receiverWallet);
    })
    .then(() => {
      console.log('[startup] Migrations applied and demo endpoint seeded.');
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[startup] Migration/seed failed: ${message}`);
      process.exit(1);
    });

  if (config.SETTLEMENT_SIGNER_PRIVATE_KEY) {
    startSettlementCron({ intervalMs: 24 * 60 * 60 * 1000, runOnStart: false });
    console.log('[settlement] Cron started — runs every 24h.');
  } else {
    console.warn('[settlement] SETTLEMENT_SIGNER_PRIVATE_KEY not set — settlement cron disabled.');
  }

  if (!config.ADMIN_API_KEY) {
    console.warn('[admin] ADMIN_API_KEY not set — /api/endpoints routes will return 401.');
  }

  return serve(
    {
      fetch: app.fetch,
      hostname: config.HOST,
      port: config.PORT,
    },
    (info) => {
      console.log(`[server] Listening on http://${info.address}:${info.port}`);
    },
  );
}

function isMainModule(metaUrl: string): boolean {
  const entryPoint = process.argv[1];
  if (!entryPoint) {
    return false;
  }

  return pathToFileURL(entryPoint).href === metaUrl;
}

if (isMainModule(import.meta.url)) {
  startServer();
}
