import { randomUUID } from 'node:crypto';

import type { Hono } from 'hono';
import { z } from 'zod';

import { getDatabasePool, type QueryablePool } from './db/connection.js';

interface EndpointRow {
  id: string;
  developer_id: string | null;
  slug: string;
  upstream_url: string;
  price_per_call_usdc_micro: string;
  receiver_wallet: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface ApiEndpointDependencies {
  pool?: QueryablePool;
  adminApiKey?: string;
}

const createEndpointSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9_-]+$/, 'slug must be lowercase alphanumeric with hyphens/underscores'),
  upstreamUrl: z.string().min(1).max(500),
  pricePerCallUsdcMicro: z.number().int().positive(),
  receiverWallet: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'receiverWallet must be a 20-byte hex address'),
  developerId: z.string().uuid().optional(),
});

const endpointIdSchema = z.object({
  id: z.string().uuid(),
});

function getPool(pool?: QueryablePool): QueryablePool {
  return pool ?? getDatabasePool();
}

function getAdminApiKey(override?: string): string | undefined {
  return override ?? process.env.ADMIN_API_KEY;
}

function unauthorizedResponse(): Response {
  return Response.json(
    { error: 'UNAUTHORIZED', message: 'Valid X-Admin-Key header required.' },
    { status: 401 },
  );
}

function checkAdminAuth(headerValue: string | undefined, adminKey: string | undefined): boolean {
  if (!adminKey) {
    // No admin key configured — log warning and deny
    console.warn('[api-endpoints] ADMIN_API_KEY not set, all admin routes will be denied');
    return false;
  }

  return headerValue === adminKey;
}

function mapEndpointRow(row: EndpointRow) {
  return {
    id: row.id,
    developerId: row.developer_id,
    slug: row.slug,
    upstreamUrl: row.upstream_url,
    pricePerCallUsdcMicro: Number(row.price_per_call_usdc_micro),
    receiverWallet: row.receiver_wallet,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function registerApiEndpointRoutes(app: Hono, dependencies: ApiEndpointDependencies = {}): void {
  app.post('/api/endpoints', async (c) => {
    const adminKey = getAdminApiKey(dependencies.adminApiKey);
    if (!checkAdminAuth(c.req.header('x-admin-key'), adminKey)) {
      return unauthorizedResponse();
    }

    let payload: z.infer<typeof createEndpointSchema>;
    try {
      payload = createEndpointSchema.parse(await c.req.json());
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Invalid request payload', details: error.flatten() }, 400);
      }

      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const pool = getPool(dependencies.pool);

    try {
      const result = await pool.query<EndpointRow>(
        `
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
          VALUES ($1, $2, $3, $4, $5, $6, 'api_key', 'active')
          RETURNING id, developer_id, slug, upstream_url, price_per_call_usdc_micro,
                    receiver_wallet, status, created_at, updated_at
        `,
        [
          randomUUID(),
          payload.developerId ?? null,
          payload.slug,
          payload.upstreamUrl,
          payload.pricePerCallUsdcMicro,
          payload.receiverWallet,
        ],
      );

      console.log(JSON.stringify({
        event: 'endpoint_created',
        id: result.rows[0].id,
        slug: result.rows[0].slug,
        pricePerCallUsdcMicro: payload.pricePerCallUsdcMicro,
        receiverWallet: payload.receiverWallet,
      }));

      return c.json(mapEndpointRow(result.rows[0]), 201);
    } catch (error) {
      const isUniqueViolation =
        error instanceof Error && error.message.includes('unique') && error.message.includes('slug');

      if (isUniqueViolation) {
        return c.json({ error: 'Slug already exists', slug: payload.slug }, 409);
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(JSON.stringify({ event: 'endpoint_create_error', error: message }));
      return c.json({ error: 'Failed to create endpoint', message: 'An internal error occurred.' }, 500);
    }
  });

  app.get('/api/endpoints', async (c) => {
    const adminKey = getAdminApiKey(dependencies.adminApiKey);
    if (!checkAdminAuth(c.req.header('x-admin-key'), adminKey)) {
      return unauthorizedResponse();
    }

    const pool = getPool(dependencies.pool);

    const rows = await pool.query<EndpointRow>(
      `
        SELECT id, developer_id, slug, upstream_url, price_per_call_usdc_micro,
               receiver_wallet, status, created_at, updated_at
        FROM api_endpoints
        ORDER BY created_at DESC
        LIMIT 200
      `,
    );

    return c.json({ endpoints: rows.rows.map(mapEndpointRow) });
  });

  app.get('/api/endpoints/:id', async (c) => {
    const adminKey = getAdminApiKey(dependencies.adminApiKey);
    if (!checkAdminAuth(c.req.header('x-admin-key'), adminKey)) {
      return unauthorizedResponse();
    }

    const params = endpointIdSchema.safeParse({ id: c.req.param('id') });
    if (!params.success) {
      return c.json({ error: 'Invalid endpoint id' }, 400);
    }

    const pool = getPool(dependencies.pool);

    const result = await pool.query<EndpointRow>(
      `
        SELECT id, developer_id, slug, upstream_url, price_per_call_usdc_micro,
               receiver_wallet, status, created_at, updated_at
        FROM api_endpoints
        WHERE id = $1
      `,
      [params.data.id],
    );

    if (result.rowCount === 0) {
      return c.json({ error: 'Endpoint not found' }, 404);
    }

    return c.json(mapEndpointRow(result.rows[0]));
  });
}
