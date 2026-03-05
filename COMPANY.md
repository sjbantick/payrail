# PAYRAIL — Company Architecture

> Stablecoin Payment Rail for Micro-APIs
> "Stripe for agent-to-agent micropayments."

---

## Company Goal

Become the default stablecoin payment rail for micro-API transactions, reaching **$10K MRR within 90 days**.

---

## Product

Lightweight middleware that sits between any API endpoint and stablecoin wallets. A developer adds one line of code and their API accepts stablecoin micropayments. Metering, invoicing, settlement, and a dashboard — all handled.

---

## Revenue Model

- 1–2% transaction fee on all payment volume
- $29/mo Pro tier (advanced analytics, custom settlement schedules)
- Enterprise tier (future — custom SLAs, dedicated infrastructure)

---

## Target Customer

- Vibe coders shipping API tools who need monetisation without entity formation or KYC
- AI agent developers building autonomous services needing machine-to-machine payment
- Micro-SaaS builders wanting usage-based pricing without Stripe's overhead

---

## Paperclip Org Chart

**Board of Directors:** Sam (governance — approves hires, overrides strategy, controls budgets)

| Agent | Role | Runtime | Heartbeat | Budget |
|---|---|---|---|---|
| CEO (Strategist) | Goal decomposition, weekly priorities, task assignment, strategy memos | Claude API | 6h | $50/mo |
| CTO (Architect) | Technical architecture, PR reviews, design docs, blocker resolution | Claude Code | 4h | $200/mo |
| Backend Engineer (Builder) | Payment SDK, metering engine, wallet integration, settlement logic, API gateway | Claude Code | 2h | $300/mo |
| Frontend Engineer (Dashboard) | Developer dashboard, landing page, docs site | Claude Code | 4h | $150/mo |
| DevOps (Ops) | CI/CD, deployment (Railway/Vercel), monitoring, alerting | Bash / Claude Code | 6h | $75/mo |
| Growth (Marketer) | Blog posts, Twitter threads, HN launch copy, Discord, cold outreach | Claude API | 12h | $75/mo |

**Total budget: $850/mo (hard cap — agents pause when exhausted)**

---

## Technical Architecture

### Stack

- **Runtime:** Node.js / TypeScript
- **Blockchain:** Base L2 (low gas, USDC native)
- **Smart Contracts:** Solidity (minimal escrow + registry)
- **Backend API:** Express or Hono
- **Frontend:** React + Tailwind
- **Database:** PostgreSQL
- **Deployment:** Railway (API) + Vercel (Dashboard/Docs)
- **CI/CD:** GitHub Actions

### Four Components

**1. SDK / Middleware** (`npm install @payrail/gateway`)
Intercepts inbound API requests, verifies USDC payment on Base, meters usage, forwards request after payment clears.

**2. Settlement Engine**
Batches micro-transactions into hourly/daily settlements. Handles wallet-to-wallet transfers, fee extraction (1–2%), and developer payouts.

**3. Developer Dashboard**
React app: real-time usage, transaction history, earnings, API key management, webhook config.

**4. Smart Contract Layer**
Minimal V1: escrow contract for batched settlements, registry for endpoint ↔ wallet mappings. Base L2.

---

## Four-Week Build Roadmap

### Week 1 — Foundation
- **CTO:** Technical design doc, stack selection, repo scaffolding
- **Backend Engineer:** Core middleware skeleton, USDC payment verification on Base, basic metering
- **DevOps:** Repo setup, CI/CD pipeline, staging on Railway
- **CEO:** Positioning document, competitive landscape

### Week 2 — Product Build
- **Backend Engineer:** Settlement engine, API key system, rate limiting
- **Frontend Engineer:** Dashboard v1 (usage stats, transactions, wallets)
- **CTO:** Architecture review, security audit
- **Growth:** Launch content drafts, waitlist page, Twitter threads

### Week 3 — Integration & Polish
- **Backend Engineer:** End-to-end payment flow testing, edge cases
- **Frontend Engineer:** Landing page, docs site, live data integration
- **DevOps:** Production deployment, monitoring, alerting
- **CEO:** Dogfood with COPILOT AI as customer zero

### Week 4 — Launch
- **Growth:** HN Show HN, Twitter launch thread, outreach to 50 devs
- **CEO:** Monitor feedback, route feature requests
- **Backend Engineer:** Bug fixes, performance optimisation
- **Frontend Engineer:** Onboarding flow improvements

---

## Governance

**Sam (Board) approves:** architecture decisions, budget increases, launch timing, agent changes, strategy overrides.

**Agents auto-execute:** implementation tickets (coding, content, infra setup).

---

## Dogfooding

PayRail's first customer is **COPILOT AI**:
- Wrap COPILOT AI API with `@payrail/gateway`
- Enable stablecoin micropayments for per-query access
- Every future AUTOPILOT venture gets PayRail baked in from day one

---

## Competitive Position

| Competitor | Gap PayRail Fills |
|---|---|
| Stripe | Too heavy for micropayments, requires entity, no stablecoin |
| x402 Protocol | Spec only, no SDK or dashboard |
| Lightning Network | Bitcoin-only, complex, poor DX |
| Manual USDC | Every dev rebuilds metering/settlement/dashboards |

**Moat:** Developer experience. The protocol layer is commoditising; the tooling layer is where value accrues.
