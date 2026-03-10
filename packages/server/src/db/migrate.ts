import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { closeDatabasePool, getDatabasePool } from './connection.js';

export interface RunMigrationsOptions {
  pool?: MigrationPool;
  migrationsDir?: string;
}

export interface MigrationSummary {
  applied: string[];
  skipped: string[];
}

interface MigrationClient {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  release(): void;
}

export interface MigrationPool {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  connect(): Promise<MigrationClient>;
}

const CREATE_MIGRATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT,
    applied_at TIMESTAMPTZ
  )
`;

const SELECT_APPLIED_MIGRATIONS_SQL = `
  SELECT name
  FROM schema_migrations
`;

const INSERT_APPLIED_MIGRATION_SQL = `
  INSERT INTO schema_migrations (name, applied_at)
  VALUES ($1, $2)
`;

export function getDefaultMigrationsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'src/db/migrations'),
    path.resolve(process.cwd(), 'packages/server/src/db/migrations'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

export async function runMigrations(options: RunMigrationsOptions = {}): Promise<MigrationSummary> {
  const pool: MigrationPool = options.pool ?? (getDatabasePool() as unknown as MigrationPool);
  const migrationsDir = options.migrationsDir ?? getDefaultMigrationsDir();

  await pool.query(CREATE_MIGRATIONS_TABLE_SQL);

  const files = await readdir(migrationsDir);
  const migrationFiles = files.filter((name) => name.endsWith('.sql')).sort((left, right) => left.localeCompare(right));

  const appliedRows = await pool.query(SELECT_APPLIED_MIGRATIONS_SQL);
  const appliedSet = new Set(
    appliedRows.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string'),
  );

  const summary: MigrationSummary = {
    applied: [],
    skipped: [],
  };

  for (const migrationFile of migrationFiles) {
    if (appliedSet.has(migrationFile)) {
      summary.skipped.push(migrationFile);
      continue;
    }

    const filePath = path.join(migrationsDir, migrationFile);
    const migrationSql = await readFile(filePath, 'utf8');

    if (!migrationSql.trim()) {
      summary.skipped.push(migrationFile);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migrationSql);
      await client.query(INSERT_APPLIED_MIGRATION_SQL, [migrationFile, new Date()]);
      await client.query('COMMIT');
      summary.applied.push(migrationFile);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return summary;
}

function isMainModule(metaUrl: string): boolean {
  const entryPoint = process.argv[1];
  if (!entryPoint) {
    return false;
  }

  return pathToFileURL(path.resolve(entryPoint)).href === metaUrl;
}

async function runMigrationsCli(): Promise<void> {
  const summary = await runMigrations();
  const appliedOutput = summary.applied.length ? summary.applied.join(', ') : 'none';
  const skippedOutput = summary.skipped.length ? summary.skipped.join(', ') : 'none';

  console.log(`Applied migrations: ${appliedOutput}`);
  console.log(`Skipped migrations: ${skippedOutput}`);
}

if (isMainModule(import.meta.url)) {
  runMigrationsCli()
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to run migrations: ${message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDatabasePool();
    });
}
