# @payrail/contracts

Minimal on-chain endpoint registry for PayRail.

## Contract

- `registerEndpoint(address wallet, bytes32 endpointId)`
- `getWallet(bytes32 endpointId)`

## Commands

```bash
pnpm --filter @payrail/contracts compile
pnpm --filter @payrail/contracts test
pnpm --filter @payrail/contracts deploy:base-sepolia
```

## Required `.env` for Base Sepolia Deploy

- `BASE_RPC_URL`
- `BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY`

Deploy script writes:
- `ENDPOINT_REGISTRY_ADDRESS`
