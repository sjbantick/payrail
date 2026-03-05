# @payrail/dashboard

Developer operations dashboard for PayRail.

## Local development

```bash
pnpm --filter @payrail/dashboard dev
```

Set API base URL if needed:

```bash
VITE_PAYRAIL_API_URL=http://127.0.0.1:3000 pnpm --filter @payrail/dashboard dev
```

## Current API integration behavior

- Uses server APIs when available.
- Falls back to explicit local mock data for missing or unavailable endpoints.
- Mock mode is visible in the UI with `Mock fallback` badges and notes.
