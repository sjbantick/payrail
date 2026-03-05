import { Hono } from 'hono';

import { getUsageByApiKey } from './metering.js';
import {
  createVerifyAndMeterHandler,
  type VerifyAndMeterDependencies,
} from './verify-and-meter.js';

export function createApp(options: VerifyAndMeterDependencies = {}) {
  const app = new Hono();

  app.get('/health', (c) => {
    return c.json({ ok: true });
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
