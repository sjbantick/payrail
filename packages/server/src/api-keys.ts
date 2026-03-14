import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { Hono } from 'hono';
import { z } from 'zod';

import type { PoolClient } from 'pg';

import { getDatabasePool, type QueryablePool } from './db/connection.js';

interface AuthApiKeyRow {
  id: string;
  developer_id: string;
  status: string;
}

interface DeveloperRow {
  id: string;
  default_payout_wallet: string;
}

interface CreatedApiKeyRow {
  id: string;
  developer_id: string;
  label: string | null;
  status: string;
  created_at: Date;
  last_used_at: Date | null;
}

interface ListApiKeyRow {
  id: string;
  label: string | null;
  status: string;
  created_at: Date;
  last_used_at: Date | null;
}

interface ApiKeyDependencies {
  pool?: QueryablePool;
}

const createKeyRequestSchema = z.object({
  developerId: z.string().uuid().optional(),
  developerName: z.string().trim().min(1).max(120).optional(),
  developerEmail: z.string().email().optional(),
  walletAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'walletAddress must be a 20-byte hex address'),
  label: z.string().trim().min(1).max(120).optional(),
});

const apiKeyIdSchema = z.object({
  id: z.string().uuid(),
});

function getPool(pool?: QueryablePool): QueryablePool {
  return pool ?? getDatabasePool();
}

function hashApiKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function generateApiKey(): string {
  return `payrail_live_${randomBytes(24).toString('hex')}`;
}

function unauthorizedResponse(): Response {
  return Response.json(
    {
      error: 'UNAUTHORIZED',
      message: 'Valid X-API-Key header is required.',
    },
    { status: 401 },
  );
}

async function authenticateManagementKey(pool: QueryablePool, apiKey: string): Promise<AuthApiKeyRow | null> {
  const keyHash = hashApiKey(apiKey);
  const result = await pool.query<AuthApiKeyRow>(
    `
      SELECT id, developer_id, status
      FROM api_keys
      WHERE key_hash = $1
      LIMIT 1
    `,
    [keyHash],
  );

  if (result.rowCount === 0) {
    return null;
  }

  const key = result.rows[0];
  if (key.status !== 'active') {
    return null;
  }

  await pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [key.id]);
  return key;
}

async function resolveDeveloperId(params: {
  client: PoolClient;
  authKey: AuthApiKeyRow | null;
  requestedDeveloperId?: string;
  requestedDeveloperName?: string;
  requestedDeveloperEmail?: string;
  walletAddress: string;
}): Promise<string> {
  if (params.authKey) {
    if (params.requestedDeveloperId && params.requestedDeveloperId !== params.authKey.developer_id) {
      throw new Error('FORBIDDEN_DEVELOPER_SCOPE');
    }

    await params.client.query(
      `
        UPDATE developers
        SET default_payout_wallet = $1
        WHERE id = $2
      `,
      [params.walletAddress, params.authKey.developer_id],
    );

    return params.authKey.developer_id;
  }

  if (params.requestedDeveloperId) {
    const existingDeveloper = await params.client.query<DeveloperRow>(
      `
        SELECT id, default_payout_wallet
        FROM developers
        WHERE id = $1
        LIMIT 1
      `,
      [params.requestedDeveloperId],
    );

    if (existingDeveloper.rowCount === 0) {
      throw new Error('DEVELOPER_NOT_FOUND');
    }

    await params.client.query(
      `
        UPDATE developers
        SET default_payout_wallet = $1
        WHERE id = $2
      `,
      [params.walletAddress, params.requestedDeveloperId],
    );

    return params.requestedDeveloperId;
  }

  const developerId = randomUUID();
  await params.client.query(
    `
      INSERT INTO developers (id, name, email, default_payout_wallet, status)
      VALUES ($1, $2, $3, $4, 'active')
    `,
    [
      developerId,
      params.requestedDeveloperName ?? `PayRail Developer ${developerId.slice(0, 8)}`,
      params.requestedDeveloperEmail ?? null,
      params.walletAddress,
    ],
  );

  return developerId;
}

export function registerApiKeyRoutes(app: Hono, dependencies: ApiKeyDependencies = {}): void {
  app.post('/api/keys', async (c) => {
    const pool = getPool(dependencies.pool);

    let payload: z.infer<typeof createKeyRequestSchema>;
    try {
      payload = createKeyRequestSchema.parse(await c.req.json());
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json(
          {
            error: 'Invalid request payload',
            details: error.flatten(),
          },
          400,
        );
      }

      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const apiKeyHeader = c.req.header('x-api-key');
    const authKey = apiKeyHeader ? await authenticateManagementKey(pool, apiKeyHeader) : null;

    if (apiKeyHeader && !authKey) {
      return unauthorizedResponse();
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const developerId = await resolveDeveloperId({
        client,
        authKey,
        requestedDeveloperId: payload.developerId,
        requestedDeveloperName: payload.developerName,
        requestedDeveloperEmail: payload.developerEmail,
        walletAddress: payload.walletAddress,
      });

      const rawApiKey = generateApiKey();
      const keyHash = hashApiKey(rawApiKey);

      const created = await client.query<CreatedApiKeyRow>(
        `
          INSERT INTO api_keys (id, developer_id, key_hash, label, status)
          VALUES ($1, $2, $3, $4, 'active')
          RETURNING id, developer_id, label, status, created_at, last_used_at
        `,
        [randomUUID(), developerId, keyHash, payload.label ?? null],
      );

      await client.query('COMMIT');

      return c.json(
        {
          id: created.rows[0].id,
          developerId: created.rows[0].developer_id,
          label: created.rows[0].label,
          status: created.rows[0].status,
          walletAddress: payload.walletAddress,
          createdAt: created.rows[0].created_at.toISOString(),
          lastUsedAt: created.rows[0].last_used_at,
          apiKey: rawApiKey,
        },
        201,
      );
    } catch (error) {
      await client.query('ROLLBACK');

      if (error instanceof Error && error.message === 'DEVELOPER_NOT_FOUND') {
        return c.json({ error: 'Unknown developerId' }, 404);
      }

      if (error instanceof Error && error.message === 'FORBIDDEN_DEVELOPER_SCOPE') {
        return c.json(
          {
            error: 'Forbidden developerId',
            message: 'Authenticated API key can only create keys for the same developer.',
          },
          403,
        );
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      return c.json(
        {
          error: 'Failed to create API key',
          message,
        },
        500,
      );
    } finally {
      client.release();
    }
  });

  app.get('/api/keys', async (c) => {
    const pool = getPool(dependencies.pool);

    const apiKeyHeader = c.req.header('x-api-key');
    if (!apiKeyHeader) {
      return unauthorizedResponse();
    }

    const authKey = await authenticateManagementKey(pool, apiKeyHeader);
    if (!authKey) {
      return unauthorizedResponse();
    }

    const rows = await pool.query<ListApiKeyRow>(
      `
        SELECT id, label, status, created_at, last_used_at
        FROM api_keys
        WHERE developer_id = $1
        ORDER BY created_at DESC
      `,
      [authKey.developer_id],
    );

    return c.json({
      developerId: authKey.developer_id,
      keys: rows.rows.map((row) => ({
        id: row.id,
        label: row.label,
        status: row.status,
        createdAt: row.created_at.toISOString(),
        lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
      })),
    });
  });

  app.delete('/api/keys/:id', async (c) => {
    const pool = getPool(dependencies.pool);

    const apiKeyHeader = c.req.header('x-api-key');
    if (!apiKeyHeader) {
      return unauthorizedResponse();
    }

    const authKey = await authenticateManagementKey(pool, apiKeyHeader);
    if (!authKey) {
      return unauthorizedResponse();
    }

    const params = apiKeyIdSchema.safeParse({
      id: c.req.param('id'),
    });

    if (!params.success) {
      return c.json(
        {
          error: 'Invalid key id',
        },
        400,
      );
    }

    if (params.data.id === authKey.id) {
      return c.json(
        {
          error: 'Cannot revoke current API key',
        },
        400,
      );
    }

    const result = await pool.query(
      `
        UPDATE api_keys
        SET status = 'revoked'
        WHERE id = $1 AND developer_id = $2
        RETURNING id, status
      `,
      [params.data.id, authKey.developer_id],
    );

    if (result.rowCount === 0) {
      return c.json(
        {
          error: 'API key not found',
        },
        404,
      );
    }

    return c.json({
      id: result.rows[0].id,
      status: result.rows[0].status,
    });
  });
}
