# @payrail/dashboard

PayRail web surface with:

- `/` landing page
- `/docs` quickstart guide
- `/dashboard` developer operations app

## Local development

```bash
pnpm --filter @payrail/dashboard dev
```

Set API base URL if needed:

```bash
VITE_PAYRAIL_API_URL=http://127.0.0.1:3000 pnpm --filter @payrail/dashboard dev
```

## API integration behavior

- Uses server APIs when available.
- Falls back to explicit local mock data for missing or unavailable endpoints.
- Mock mode is visible in the dashboard UI with `Mock fallback` badges and notes.

## Vercel deploy notes

- Build command: `pnpm --filter @payrail/dashboard build`
- Output directory: `packages/dashboard/dist`
- SPA rewrites are configured in `packages/dashboard/vercel.json` so `/docs` and `/dashboard` resolve to `index.html`.
