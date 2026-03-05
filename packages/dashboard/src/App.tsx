import { FormEvent, ReactNode, useState } from 'react';

import DashboardApp from './DashboardApp';

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized.length === 0 ? '/' : normalized;
}

function CodeBlock({ value }: { value: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-cyan-100">
      <code>{value}</code>
    </pre>
  );
}

function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/90">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between p-4">
          <a href="/" className="text-sm font-semibold tracking-wide text-cyan-200">
            PayRail
          </a>
          <nav className="flex items-center gap-3 text-sm text-slate-300">
            <a className="transition hover:text-cyan-200" href="/docs">
              Docs
            </a>
            <a className="transition hover:text-cyan-200" href="/dashboard">
              Dashboard
            </a>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function LandingPage() {
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleWaitlistSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!waitlistEmail.trim()) {
      return;
    }

    window.localStorage.setItem('payrail.waitlist.email', waitlistEmail.trim());
    setIsSubmitted(true);
    setWaitlistEmail('');
  };

  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-6xl px-6 pb-14 pt-20">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Developer monetization</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-white md:text-5xl">
            Charge USDC for every API call without rebuilding your stack.
          </h1>
          <p className="mt-5 text-base text-slate-300 md:text-lg">
            PayRail verifies payment transactions, meters usage, and handles settlement so teams can
            ship paid APIs quickly.
          </p>
          <CodeBlock value="pnpm add @payrail/gateway" />
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/docs"
              className="rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
            >
              Read quickstart
            </a>
            <a
              href="/dashboard"
              className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:border-cyan-400 hover:text-cyan-200"
            >
              Open dashboard
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <h2 className="text-2xl font-semibold text-white">How it works</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs uppercase tracking-[0.12em] text-cyan-200">1. Wrap</p>
            <h3 className="mt-2 text-base font-medium text-white">Add gateway middleware</h3>
            <p className="mt-2 text-sm text-slate-300">
              Add `@payrail/gateway` to your route layer to enforce payment headers and run verification.
            </p>
          </article>
          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs uppercase tracking-[0.12em] text-cyan-200">2. Verify</p>
            <h3 className="mt-2 text-base font-medium text-white">Confirm USDC payment</h3>
            <p className="mt-2 text-sm text-slate-300">
              Send transaction metadata to `@payrail/server` and return 402 until a valid transfer is
              detected.
            </p>
          </article>
          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs uppercase tracking-[0.12em] text-cyan-200">3. Settle</p>
            <h3 className="mt-2 text-base font-medium text-white">Track usage and payouts</h3>
            <p className="mt-2 text-sm text-slate-300">
              Monitor earnings in the dashboard and settle on the schedule that matches your ops model.
            </p>
          </article>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <h2 className="text-2xl font-semibold text-white">Pricing</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h3 className="text-lg font-semibold text-white">Free</h3>
            <p className="mt-2 text-3xl font-semibold text-cyan-200">$0</p>
            <p className="mt-1 text-sm text-slate-400">for prototyping and dev sandboxes</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              <li>• Core gateway middleware</li>
              <li>• Basic dashboard analytics</li>
              <li>• Community support</li>
            </ul>
          </article>
          <article className="rounded-2xl border border-cyan-700/70 bg-cyan-950/20 p-5">
            <h3 className="text-lg font-semibold text-white">Pro</h3>
            <p className="mt-2 text-3xl font-semibold text-cyan-200">$99/mo</p>
            <p className="mt-1 text-sm text-slate-300">for production API teams</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-200">
              <li>• Higher throughput settlement lanes</li>
              <li>• Priority support and incident routing</li>
              <li>• Team controls and audit-ready logs</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-20 pt-8">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 md:p-8">
          <h2 className="text-2xl font-semibold text-white">Join the waitlist</h2>
          <p className="mt-2 text-sm text-slate-300">
            We are onboarding teams shipping paid APIs on Base Sepolia first.
          </p>

          <form onSubmit={handleWaitlistSubmit} className="mt-4 flex flex-col gap-3 md:flex-row">
            <input
              type="email"
              required
              value={waitlistEmail}
              onChange={(event) => setWaitlistEmail(event.target.value)}
              placeholder="you@company.com"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
            />
            <button
              type="submit"
              className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
            >
              Request access
            </button>
          </form>

          {isSubmitted ? (
            <p className="mt-3 text-sm text-emerald-200">
              Thanks — your waitlist request was recorded locally for this environment.
            </p>
          ) : null}
        </div>
      </section>
    </MarketingLayout>
  );
}

function DocsPage() {
  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-5xl px-6 pb-20 pt-16">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Docs</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Quickstart: first paid API request</h1>
        <p className="mt-3 text-sm text-slate-300">
          Integrate `@payrail/gateway`, verify payment on `@payrail/server`, and test with USDC on
          Base Sepolia.
        </p>

        <div className="mt-8 space-y-8">
          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold text-white">1) Install gateway package</h2>
            <CodeBlock value="pnpm add @payrail/gateway" />
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold text-white">2) Wrap your protected endpoint</h2>
            <CodeBlock
              value={`import { Hono } from 'hono';
import { payrailGateway } from '@payrail/gateway';

const app = new Hono();

app.use('/v1/private/*', payrailGateway({
  verifyPayment: async ({ txHash, requestId, method, path }) => {
    const response = await fetch('http://127.0.0.1:3000/v1/verify-and-meter', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        endpointId: 'your-endpoint-id',
        requestId,
        payment: { txHash, chainId: 84532, token: 'USDC' },
        request: { method, path }
      })
    });

    if (!response.ok) {
      return { allowed: false, code: 'PAYMENT_REQUIRED', message: 'Payment verification failed.' };
    }

    return { allowed: true, txHash };
  }
}));`}
            />
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold text-white">3) Test with USDC on Base Sepolia</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-300">
              <li>Set server env (`DATABASE_URL`, `USDC_CONTRACT_ADDRESS`) and start `@payrail/server`.</li>
              <li>Use a Base Sepolia USDC transfer transaction hash in your `x-payment-tx` header.</li>
              <li>Call your protected route and confirm accepted requests appear in dashboard metrics.</li>
            </ol>
            <CodeBlock
              value={`curl -X POST http://127.0.0.1:8787/v1/private/echo \\
  -H 'x-payment-tx: 0xabc123...' \\
  -H 'x-request-id: req_demo_001' \\
  -H 'content-type: application/json' \\
  -d '{"hello":"world"}'`}
            />
          </article>
        </div>
      </section>
    </MarketingLayout>
  );
}

export default function App() {
  const pathname = normalizePathname(window.location.pathname);

  if (pathname === '/dashboard') {
    return <DashboardApp />;
  }

  if (pathname === '/docs') {
    return <DocsPage />;
  }

  return <LandingPage />;
}
