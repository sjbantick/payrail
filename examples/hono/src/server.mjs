import { serve } from '@hono/node-server';

import { createExampleApp } from './app.mjs';

function readPort() {
  const parsed = Number.parseInt(process.env.PORT ?? '8787', 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 8787;
  }

  return parsed;
}

function readChainId() {
  const parsed = Number.parseInt(process.env.PAYRAIL_CHAIN_ID ?? '8453', 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 8453;
  }

  return parsed;
}

const port = readPort();

const mode = process.env.PAYRAIL_EXAMPLE_MODE;
const verifyAndMeterUrl = process.env.PAYRAIL_VERIFY_AND_METER_URL;

const { app, config: runtimeConfig, mode: activeMode } = createExampleApp({
  mode,
  verifyAndMeterUrl,
  endpointId: process.env.PAYRAIL_ENDPOINT_ID,
  chainId: readChainId(),
  token: process.env.PAYRAIL_TOKEN,
});

console.log('Starting @payrail/example-hono');
console.log(`Mode: ${activeMode}`);
if (runtimeConfig.verifyAndMeterUrl) {
  console.log(`verify-and-meter URL: ${runtimeConfig.verifyAndMeterUrl}`);
}
console.log(`Listening on http://127.0.0.1:${port}`);

serve({
  fetch: app.fetch,
  port,
});

