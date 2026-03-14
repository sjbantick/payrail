import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

/**
 * Shared database abstractions.
 *
 * Every module that needs a DB connection imports from here.
 * No module should create its own Pool.
 *
 *   startServer()
 *       │
 *       ├─ initDatabasePool(DATABASE_URL)   ← creates the singleton
 *       │
 *       └─ createApp({ pool })
 *             ├─ verify-and-meter  ─┐
 *             ├─ api-keys          ─┤
 *             ├─ api-endpoints     ─┼─ all use getDatabasePool()
 *             ├─ settlement        ─┤
 *             └─ /api/usage        ─┘
 */

export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

export interface QueryablePool extends Queryable {
  connect(): Promise<PoolClient>;
}

let pool: Pool | null = null;

/**
 * Initialise the singleton pool with an explicit connection string.
 * Called once from `startServer()`. Subsequent calls are no-ops.
 */
export function initDatabasePool(connectionString: string): Pool {
  if (pool) {
    return pool;
  }

  pool = new Pool({ connectionString });
  return pool;
}

/**
 * Return the singleton pool. Throws if `initDatabasePool` was never called
 * and DATABASE_URL is not set.
 */
export function getDatabasePool(): Pool {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database operations.');
  }

  pool = new Pool({ connectionString });
  return pool;
}

export async function closeDatabasePool(): Promise<void> {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = null;
}
