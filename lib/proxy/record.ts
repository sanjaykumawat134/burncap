import "server-only";
import { redis, keys } from "@/lib/redis";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PLANS } from "@/lib/plans";
import { evaluateAlerts } from "@/lib/budgets/alerts";
import { periodKey, periodTtlSeconds } from "@/lib/budgets/periods";
import { costMicros, findPrice } from "./pricing";
import type { BudgetPeriod, ModelPrice, Provider, RequestContext, Usage } from "@/types/domain";

let priceCache: { at: number; prices: ModelPrice[] } | null = null;

async function loadPrices(): Promise<ModelPrice[]> {
  if (priceCache && Date.now() - priceCache.at < 10 * 60_000) return priceCache.prices;
  const { data, error } = await supabaseAdmin().from("model_prices").select("*");
  if (error) throw error;
  const prices: ModelPrice[] = (data ?? []).map((p) => ({
    provider: p.provider as Provider,
    model: p.model,
    inputPerMtokMicros: Number(p.input_per_mtok_micros),
    outputPerMtokMicros: Number(p.output_per_mtok_micros),
    cachedInputPerMtokMicros: p.cached_input_per_mtok_micros === null ? null : Number(p.cached_input_per_mtok_micros),
    cacheWritePerMtokMicros: p.cache_write_per_mtok_micros === null ? null : Number(p.cache_write_per_mtok_micros),
  }));
  priceCache = { at: Date.now(), prices };
  return prices;
}

/**
 * Post-response metering. Redis counters always update (so enforcement keeps working);
 * Postgres writes are skipped once the workspace is over its plan's monthly request quota.
 */
export async function recordUsage(
  ctx: RequestContext,
  usage: Usage,
  meta: { statusCode: number; latencyMs: number | null; costMicros?: number },
) {
  // Callers that already know the cost (manual ingest with cost_usd) skip the price table
  const price = meta.costMicros === undefined ? findPrice(await loadPrices(), ctx.provider, usage.model) : null;
  if (meta.costMicros === undefined && !price) console.warn(`[meter] no price for ${ctx.provider}/${usage.model}`);
  const cost = meta.costMicros ?? (price ? costMicros(usage, price) : 0);

  const now = new Date();
  const scopes: [string, string][] = [
    ["workspace", "_"],
    ["agent", ctx.agentId],
    ...(ctx.customerId ? [["customer", ctx.customerId] as [string, string]] : []),
  ];
  const periods: BudgetPeriod[] = ["daily", "monthly"];

  const pipe = redis().pipeline();
  const spendKeys: string[] = [];
  for (const [scope, id] of scopes) {
    for (const p of periods) {
      const k = keys.spend(ctx.workspaceId, scope, id, periodKey(p, now));
      spendKeys.push(k);
      pipe.incrby(k, cost);
      pipe.expire(k, periodTtlSeconds(p));
    }
  }
  const reqKey = keys.requests(ctx.workspaceId, periodKey("monthly", now));
  pipe.incr(reqKey);
  pipe.expire(reqKey, periodTtlSeconds("monthly"));

  const results = (await pipe.exec()) as number[];
  const totals = new Map(spendKeys.map((k, i) => [k, Number(results[i * 2])]));
  const requestsThisMonth = Number(results[spendKeys.length * 2]);

  await evaluateAlerts(ctx, totals, cost);

  if (requestsThisMonth > PLANS[ctx.plan].requestsPerMonth) return;

  const db = supabaseAdmin();
  const results2 = await Promise.all([
    db.from("usage_events").insert({
      workspace_id: ctx.workspaceId,
      agent_id: ctx.agentId,
      run_id: ctx.runId,
      customer_id: ctx.customerId,
      provider: ctx.provider,
      model: usage.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cached_input_tokens: usage.cachedInputTokens,
      cache_write_tokens: usage.cacheWriteTokens,
      cost_micros: cost,
      priced: meta.costMicros !== undefined || price !== null,
      status_code: meta.statusCode,
      latency_ms: meta.latencyMs,
    }),
    db.rpc("increment_usage_daily", {
      p_ws: ctx.workspaceId,
      p_day: now.toISOString().slice(0, 10),
      p_agent: ctx.agentId,
      p_customer: ctx.customerId,
      p_model: usage.model,
      p_in: usage.inputTokens + usage.cachedInputTokens + usage.cacheWriteTokens,
      p_out: usage.outputTokens,
      p_cost: cost,
    }),
    db
      .from("agents")
      .upsert(
        { workspace_id: ctx.workspaceId, id: ctx.agentId, last_seen_at: now.toISOString() },
        { onConflict: "workspace_id,id" },
      ),
  ]);
  for (const r of results2) if (r.error) console.error("[meter] db write failed", r.error);
}
