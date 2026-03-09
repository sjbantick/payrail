import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { closeDatabasePool, getDatabasePool } from './connection.js';
import { seedDevFixtures } from './fixtures.js';
import { runMigrations } from './migrate.js';

function isMainModule(metaUrl: string): boolean {
  const entryPoint = process.argv[1];
  if (!entryPoint) {
    return false;
  }

  return pathToFileURL(path.resolve(entryPoint)).href === metaUrl;
}

export async function runSeed(): Promise<void> {
  const pool = getDatabasePool();
  await runMigrations({ pool });
  const result = await seedDevFixtures(pool);

  console.log(`Seeded developer: ${result.developer.id}`);
  console.log(`Seeded endpoint: ${result.endpoint.id}`);
  console.log(`Seeded api key id: ${result.apiKey.id}`);
  console.log(`Seeded payment intent: ${result.paymentIntent.id}`);
  console.log(`Generated plaintext API key: ${result.plaintextApiKey}`);
}

if (isMainModule(import.meta.url)) {
  runSeed()
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to seed fixtures: ${message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDatabasePool();
    });
}
