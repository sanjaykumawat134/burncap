import "server-only";
import { DEMO_USER, DEMO_WORKSPACE_ID } from "./index";

/* eslint-disable @typescript-eslint/no-explicit-any -- fixture rows mirror untyped DB rows */
export type Row = Record<string, any>;

export interface DemoStore {
  tables: Record<string, Row[]>;
  users: Map<string, string>; // id → email
  redis: Map<string, unknown>;
}

const WS = DEMO_WORKSPACE_ID;
const DAY = 86_400_000;

/** Deterministic PRNG so the demo looks the same on every restart. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AGENTS = [
  { id: "claude-code", name: "Claude Code (dev team)", model: "claude-sonnet-4-5", daily: 8, status: "active" },
  { id: "research-crew", name: "Research crew", model: "gpt-4.1", daily: 2.5, status: "active" },
  { id: "pr-reviewer", name: "PR reviewer", model: "claude-haiku-4-5", daily: 1.8, status: "active" },
  { id: "support-bot", name: "Support bot", model: "gpt-4o-mini", daily: 1.1, status: "active" },
  { id: "nightly-evals", name: "Nightly evals", model: "claude-sonnet-4-5", daily: 3.2, status: "paused" },
] as const;

const iso = (t: number) => new Date(t).toISOString();
const dayStr = (t: number) => iso(t).slice(0, 10);
const micros = (usd: number) => Math.round(usd * 1_000_000);

function seed(): DemoStore {
  const rand = mulberry32(42);
  const now = Date.now();
  const todayStart = Date.parse(`${dayStr(now)}T00:00:00Z`);
  const dayFraction = (now - todayStart) / DAY;

  // ── Daily rollups: 35 days so month-to-date always has data ──
  const usage_daily: Row[] = [];
  for (let d = 34; d >= 0; d--) {
    const t = todayStart - d * DAY;
    const weekday = new Date(t).getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? 0.35 : 1;
    for (const a of AGENTS) {
      if (a.id === "nightly-evals" && d < 3) continue; // paused 3 days ago
      let usd = a.daily * weekend * (0.6 + rand() * 0.8);
      if (a.id === "research-crew" && d === 1) usd = 47; // a runaway run yesterday
      if (d === 0) usd *= dayFraction;
      const requests = Math.max(1, Math.round(usd * (a.model.includes("mini") || a.model.includes("haiku") ? 900 : 60)));
      usage_daily.push({
        workspace_id: WS,
        day: dayStr(t),
        agent_id: a.id,
        customer_id: "",
        model: a.model,
        requests,
        input_tokens: requests * 2400,
        output_tokens: requests * 380,
        cost_micros: micros(usd),
      });
    }
  }

  // ── Raw events grouped into runs (last 7 days) ──
  const usage_events: Row[] = [];
  let eventId = 1;
  for (let r = 0; r < 28; r++) {
    // Run 0 is research-crew's runaway run; the rest are spread over the active agents
    const a = r === 0 ? AGENTS[1] : AGENTS[Math.floor(rand() * 4)];
    const start = now - rand() * 7 * DAY;
    const calls = 3 + Math.floor(rand() * 40);
    const runCost = a.id === "research-crew" && r === 0 ? 31.4 : a.daily * (0.05 + rand() * 0.4);
    const runId = `${a.id.split("-")[0]}-${(start / 1000).toFixed(0).slice(-6)}`;
    for (let c = 0; c < calls; c++) {
      usage_events.push({
        id: eventId++,
        workspace_id: WS,
        agent_id: a.id,
        run_id: runId,
        customer_id: null,
        provider: a.model.startsWith("claude") ? "anthropic" : "openai",
        model: a.model,
        input_tokens: 1800 + Math.floor(rand() * 6000),
        output_tokens: 200 + Math.floor(rand() * 900),
        cached_input_tokens: Math.floor(rand() * 4000),
        cache_write_tokens: 0,
        cost_micros: micros(runCost / calls),
        priced: true,
        status_code: 200,
        latency_ms: 800 + Math.floor(rand() * 6000),
        created_at: iso(start + c * (20_000 + rand() * 60_000)),
      });
    }
  }
  // Pin the runaway run to yesterday so it lines up with the chart spike
  const runaway = usage_events.filter((e) => e.run_id === usage_events[0].run_id);
  runaway.forEach((e, i) => (e.created_at = iso(todayStart - DAY + 14 * 3_600_000 + i * 45_000)));

  const workspaceBudgetId = "b0000000-0000-4000-8000-000000000001";
  const researchBudgetId = "b0000000-0000-4000-8000-000000000002";
  const budgetCreated = iso(now - 20 * DAY);
  const budgets: Row[] = [
    {
      id: workspaceBudgetId,
      workspace_id: WS,
      scope: "workspace",
      scope_id: null,
      period: "monthly",
      limit_micros: micros(300),
      action: "pause",
      throttle_rpm: 5,
      alert_thresholds: [50, 80, 100],
      enabled: true,
      created_at: budgetCreated,
    },
    {
      id: researchBudgetId,
      workspace_id: WS,
      scope: "agent",
      scope_id: "research-crew",
      period: "monthly",
      limit_micros: micros(60),
      action: "pause",
      throttle_rpm: 5,
      alert_thresholds: [50, 80, 100],
      enabled: true,
      created_at: budgetCreated,
    },
  ];

  const monthKey = `m:${dayStr(now).slice(0, 7)}`;
  const budgetRef = (b: Row) => ({ workspace_id: WS, scope: b.scope, scope_id: b.scope_id, period: b.period });
  const alert_events: Row[] = [
    { budget_id: researchBudgetId, period_key: monthKey, threshold: 80, spent_micros: micros(49.2), sent_at: iso(todayStart - DAY + 15 * 3_600_000), budgets: budgetRef(budgets[1]) },
    { budget_id: researchBudgetId, period_key: monthKey, threshold: 50, spent_micros: micros(31.7), sent_at: iso(todayStart - DAY + 14 * 3_600_000 + 1_200_000), budgets: budgetRef(budgets[1]) },
  ];

  const workspace = {
    id: WS,
    name: "Acme AI",
    plan: "free",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    created_at: iso(now - 40 * DAY),
  };

  // Seed the Redis spend counters the proxy enforces against, so they agree with the rollups above
  const redis = new Map<string, unknown>([[`paused:${WS}:nightly-evals`, 1]]);
  const today = dayStr(now);
  const month = today.slice(0, 7);
  for (const r of usage_daily) {
    const periods = [...(r.day === today ? [`d:${today}`] : []), ...(r.day.startsWith(month) ? [`m:${month}`] : [])];
    for (const [scope, id] of [["workspace", "_"], ["agent", r.agent_id]]) {
      for (const pk of periods) {
        const k = `spend:${WS}:${scope}:${id}:${pk}`;
        redis.set(k, Number(redis.get(k) ?? 0) + r.cost_micros);
      }
    }
  }

  return {
    users: new Map([[DEMO_USER.id, DEMO_USER.email]]),
    redis,
    tables: {
      workspaces: [workspace],
      workspace_members: [
        { workspace_id: WS, user_id: DEMO_USER.id, role: "owner", created_at: workspace.created_at, workspaces: { name: workspace.name } },
      ],
      api_keys: [
        { id: "k1", workspace_id: WS, name: "production", key_prefix: "bc_live_7Kx2", key_hash: "demo1", last_used_at: iso(now - 4 * 60_000), revoked_at: null, created_at: iso(now - 30 * DAY) },
        { id: "k2", workspace_id: WS, name: "local-dev", key_prefix: "bc_live_p9Qa", key_hash: "demo2", last_used_at: iso(now - 2 * DAY), revoked_at: null, created_at: iso(now - 12 * DAY) },
      ],
      agents: AGENTS.map((a) => ({
        workspace_id: WS,
        id: a.id,
        display_name: a.name,
        status: a.status,
        first_seen_at: iso(now - 34 * DAY),
        last_seen_at: iso(a.status === "paused" ? todayStart - 3 * DAY + 2 * 3_600_000 : now - rand() * 3_600_000),
      })),
      usage_daily,
      usage_events,
      budgets,
      alert_channels: [
        { id: "c1", workspace_id: WS, type: "email", target: DEMO_USER.email, enabled: true, created_at: workspace.created_at },
      ],
      alert_events,
      workspace_invites: [],
      model_prices: [],
    },
  };
}

const g = globalThis as unknown as { __burncapDemo?: DemoStore };

/** One store per dev-server process, shared by pages and server actions. */
export function demoStore(): DemoStore {
  g.__burncapDemo ??= seed();
  return g.__burncapDemo;
}
