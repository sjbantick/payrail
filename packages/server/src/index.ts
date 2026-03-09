import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

import { registerApiKeyRoutes } from './api-keys.js';
import { getUsageByApiKey } from './metering.js';
import {
  createVerifyAndMeterHandler,
  type VerifyAndMeterDependencies,
} from './verify-and-meter.js';

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

export function createApp(options: VerifyAndMeterDependencies = {}) {
  const app = new Hono();

  app.get('/health', (c) => {
    return c.json({ ok: true });
  });

  registerApiKeyRoutes(app, {
    pool: options.pool as never,
  });

  app.post('/v1/verify-and-meter', createVerifyAndMeterHandler(options));

  app.get('/api/usage/:apiKey', async (c) => {
    try {
      const apiKey = c.req.param('apiKey');
      const usage = await getUsageByApiKey(apiKey);

      if (!usage) {
        return c.json({ error: 'Usage not found.' }, 404);
      }

      return c.json({
        apiKey: usage.apiKey,
        requestCount: usage.requestCount,
        totalUsdcReceived: usage.totalUsdcReceived,
        firstRequestAt: usage.firstRequestAt.toISOString(),
        lastRequestAt: usage.lastRequestAt.toISOString(),
        updatedAt: usage.updatedAt.toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      return c.json(
        {
          error: 'Failed to load usage.',
          message,
        },
        500,
      );
    }
  });

  return app;
}

const app = createApp();

export default app;

export function startServer(env = process.env) {
  const config = parseServerEnv(env);

  return serve(
    {
      fetch: app.fetch,
      hostname: config.HOST,
      port: config.PORT,
    },
    (addressInfo) => {
      const baseUrl = `http://${addressInfo.address}:${addressInfo.port}`;

      console.info(`[payrail-server] listening on ${baseUrl}`);
      console.info(`[payrail-server] health check: GET ${baseUrl}/health`);
    },
  );
}

function isExecutedDirectly(): boolean {
  const entryPoint = process.argv[1];
  if (!entryPoint) {
    return false;
  }

  return import.meta.url === pathToFileURL(entryPoint).href;
}

if (isExecutedDirectly()) {
  try {
    startServer();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown startup error.';
    console.error(`[payrail-server] failed to start\n${message}`);
    process.exit(1);
  }
}
