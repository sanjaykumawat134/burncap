# BurnCap

Hard budgets for AI agents. A drop-in proxy for OpenAI and Anthropic that tracks spend per agent / run / customer and pauses or throttles agents when they hit a limit.

## Setup

1. **Supabase**: create a project, then run the files in `supabase/migrations/` in order in the SQL editor.
   In Auth → URL Configuration, add `http://localhost:3000/auth/callback` to the redirect URLs.
2. **Upstash Redis**: create a database and copy the REST URL and token.
3. **Stripe** (test mode): create a "Pro" product with a $29/month price and copy the price ID. For local webhooks:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   Paste the `whsec_…` secret it prints into `STRIPE_WEBHOOK_SECRET`. In production, add the endpoint in the Stripe dashboard
   with `checkout.session.completed` and `customer.subscription.created/updated/deleted`.
4. `cp .env.example .env.local` and fill in the values.
5. `npm install && npm run dev`
6. Load model prices once (afterwards Vercel Cron runs it nightly):
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-prices
   ```
7. Sign in, create an API key, and point an agent at the proxy:
   ```bash
   export ANTHROPIC_BASE_URL=http://localhost:3000/api/v1/anthropic
   export ANTHROPIC_CUSTOM_HEADERS="x-bc-key: bc_live_...
   x-bc-agent: claude-code"
   ```

## Demo mode (no accounts needed)

Preview every page with sample data and a fake signed-in user:

```bash
echo BURNCAP_DEMO=1 >> .env.local
npm run dev
```

Open `/app`. Data lives in memory and resets when the dev server restarts, "Upgrade to Pro" and "Manage billing"
simulate Stripe, and emails/Slack messages are printed to the server log. Demo mode is ignored in production builds.
The proxy itself still needs real Supabase/Upstash.

## How it works

```
agent → /api/v1/{openai|anthropic}/... → budget check (Redis) → provider
                                        ← streamed response ←
                         after(): parse usage → cost → Redis counters + Postgres + alerts
```

| Header | Required | Purpose |
|---|---|---|
| `x-bc-key` | yes | BurnCap API key (stripped before forwarding) |
| `x-bc-agent` | no | Agent id, defaults to `default` |
| `x-bc-run` | no | Groups calls into a run/task |
| `x-bc-customer` | no | Attributes spend to your customer (Pro) |

Your provider key (`Authorization` / `x-api-key`) passes through and is never stored.

Full API docs are served at `/docs`.

- Blocked requests get `402 budget_exceeded`; throttled ones get `429` with `retry-after`.
- Cost is known only after a response, so a budget can be overshot by at most the in-flight requests.
- If Redis is unavailable, the budget check **fails open** so BurnCap never takes your agents down.

## Code map

| Path | What |
|---|---|
| `app/api/v1/[provider]/[...path]/route.ts` | The proxy |
| `lib/proxy/usage.ts` | Token usage from JSON and SSE responses |
| `lib/proxy/record.ts` | Metering: Redis counters, events, daily rollups |
| `lib/budgets/check.ts` | Pre-request enforcement |
| `lib/budgets/alerts.ts` | Threshold alerts (email via Resend, Slack webhook) |
| `lib/budgets/scope.ts` | Which budgets apply to a request, with plan limits re-applied |
| `app/api/stripe/webhook/route.ts` | Mirrors Stripe subscription state into `workspaces.plan` |
| `app/api/cron/purge/route.ts` | Nightly deletion of raw events past plan retention |
| `app/api/v1/events/route.ts` | Manual usage ingest for calls that skip the proxy |
| `app/api/v1/agents/[agentId]/status/route.ts` | Agent budget status (active / throttled / paused) |
| `app/w/[workspaceId]/export/route.ts` | Monthly CSV export of daily spend |
| `sdk/js/` | TypeScript SDK (`burncap` npm package, unpublished): base URLs, headers, `isBudgetError`, `track`, `status` |
| `sdk/python/` | Python SDK (`burncap` PyPI package, unpublished), same API |
| `.github/workflows/ci.yml` | CI: app lint/typecheck/test/build, SDK build + pack, Python tests on 3.9 and 3.13 |
| `lib/demo/` | Demo mode: fixtures plus in-memory Supabase/Redis stand-ins |
| `supabase/migrations/` | Schema, RLS, new-user workspace trigger |

## Scripts

`npm run dev` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run build`

## Not built yet

Overage billing. Publishing the SDKs to npm and PyPI (packages are ready; pick a license first).
