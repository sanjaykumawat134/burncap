import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateKey } from "@/lib/auth/api-key";
import { checkBudgets } from "@/lib/budgets/check";
import { recordUsage } from "@/lib/proxy/record";
import { proxyError } from "@/lib/proxy/providers";
import { toMicros, type RequestContext } from "@/types/domain";

export const runtime = "nodejs";

const Id = z.string().regex(/^[\w.:@-]{1,128}$/, "ids may contain letters, digits and _ . : @ - (max 128)");
const Tokens = z.number().int().min(0).max(100_000_000);

const Event = z.object({
  agent_id: Id.default("default"),
  run_id: Id.nullish(),
  customer_id: Id.nullish(),
  provider: z.enum(["openai", "anthropic"]),
  model: z.string().min(1).max(128),
  input_tokens: Tokens.default(0),
  output_tokens: Tokens.default(0),
  cached_input_tokens: Tokens.default(0),
  cache_write_tokens: Tokens.default(0),
  /** Optional: if you already know the cost, it's used instead of BurnCap's price table. */
  cost_usd: z.number().min(0).max(10_000).optional(),
  latency_ms: z.number().int().min(0).optional(),
});

const Batch = z.object({ events: z.array(Event).min(1).max(100) });

/**
 * Manual ingest for calls that don't go through the proxy (other gateways, batch jobs, local models).
 * Records usage, then reports each agent's budget status so the caller can stop if it's paused.
 */
export async function POST(req: NextRequest) {
  const owner = await authenticateKey(req.headers.get("x-bc-key"));
  if (!owner) return proxyError(401, "invalid_burncap_key", "Missing or invalid x-bc-key header");

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return proxyError(400, "invalid_json", "Request body must be JSON");
  }
  // Pick the schema up front (rather than a union) so validation errors name the actual field
  const isBatch = typeof json === "object" && json !== null && "events" in json;
  const parsed = Batch.safeParse(isBatch ? json : { events: [json] });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return proxyError(400, "invalid_event", `${issue.path.join(".") || "body"}: ${issue.message}`);
  }

  const contexts = new Map<string, RequestContext>();
  for (const e of parsed.data.events) {
    const ctx: RequestContext = {
      workspaceId: owner.id,
      plan: owner.plan,
      provider: e.provider,
      agentId: e.agent_id,
      runId: e.run_id ?? null,
      customerId: e.customer_id ?? null,
    };
    // Sequential on purpose: alert threshold crossings are computed from running totals
    await recordUsage(
      ctx,
      {
        model: e.model,
        inputTokens: e.input_tokens,
        outputTokens: e.output_tokens,
        cachedInputTokens: e.cached_input_tokens,
        cacheWriteTokens: e.cache_write_tokens,
      },
      { statusCode: 200, latencyMs: e.latency_ms ?? null, costMicros: e.cost_usd === undefined ? undefined : toMicros(e.cost_usd) },
    );
    contexts.set(`${ctx.agentId}\u0000${ctx.customerId ?? ""}`, ctx);
  }

  const RANK = { active: 0, throttled: 1, paused: 2 } as const;
  const agents: Record<string, keyof typeof RANK> = {};
  for (const ctx of contexts.values()) {
    let status: keyof typeof RANK = "active";
    try {
      const d = await checkBudgets(ctx, { dryRun: true });
      status = d.action === "pause" ? "paused" : d.action === "throttle" ? "throttled" : "active";
    } catch (e) {
      console.error("[events] budget check failed", e);
    }
    // Worst status wins when an agent appears with several customers
    if (RANK[status] >= RANK[agents[ctx.agentId] ?? "active"]) agents[ctx.agentId] = status;
  }

  return Response.json({ recorded: parsed.data.events.length, agents });
}
