import { NextRequest, after } from "next/server";
import { authenticateKey } from "@/lib/auth/api-key";
import { checkBudgets } from "@/lib/budgets/check";
import {
  UPSTREAM,
  forwardRequestHeaders,
  forwardResponseHeaders,
  isProvider,
  proxyError,
} from "@/lib/proxy/providers";
import { extractUsageFromJson, extractUsageFromSse } from "@/lib/proxy/usage";
import { recordUsage } from "@/lib/proxy/record";
import { usd, type BudgetDecision, type RequestContext } from "@/types/domain";

export const runtime = "nodejs";
export const maxDuration = 300;

type Params = { params: Promise<{ provider: string; path: string[] }> };

const ID = /^[\w.:@-]{1,128}$/;
const attr = (h: Headers, name: string) => {
  const v = h.get(name)?.trim();
  return v && ID.test(v) ? v : null;
};

async function resolveContext(req: NextRequest, provider: string) {
  if (!isProvider(provider)) return { error: proxyError(404, "unknown_provider", `Unsupported provider: ${provider}`) };
  const owner = await authenticateKey(req.headers.get("x-bc-key"));
  if (!owner) return { error: proxyError(401, "invalid_burncap_key", "Missing or invalid x-bc-key header") };

  const ctx: RequestContext = {
    workspaceId: owner.id,
    plan: owner.plan,
    provider,
    agentId: attr(req.headers, "x-bc-agent") ?? "default",
    runId: attr(req.headers, "x-bc-run"),
    customerId: attr(req.headers, "x-bc-customer"),
  };
  return { ctx };
}

export async function POST(req: NextRequest, { params }: Params) {
  const { provider, path } = await params;
  const resolved = await resolveContext(req, provider);
  if ("error" in resolved) return resolved.error;
  const { ctx } = resolved;

  // Fail open: a BurnCap outage must never take down the customer's agents.
  let decision: BudgetDecision = { action: "allow" };
  try {
    decision = await checkBudgets(ctx);
  } catch (e) {
    console.error("[proxy] budget check failed, allowing request", e);
  }

  if (decision.action === "pause") {
    const msg =
      decision.reason === "manual"
        ? `Agent '${ctx.agentId}' is paused in BurnCap`
        : `BurnCap ${decision.budget!.period} budget exceeded for ${decision.budget!.scope}` +
          ` ($${usd(decision.spentMicros!).toFixed(2)} of $${usd(decision.budget!.limitMicros).toFixed(2)})`;
    return proxyError(402, "budget_exceeded", msg);
  }
  if (decision.action === "throttle") {
    return proxyError(429, "budget_throttled", `Over budget: throttled to ${decision.budget.throttleRpm} requests/min`, {
      "retry-after": "60",
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return proxyError(400, "invalid_json", "Request body must be JSON");
  }
  if (ctx.provider === "openai" && body.stream === true) {
    body.stream_options = { ...(body.stream_options as object | undefined), include_usage: true };
  }

  const started = Date.now();
  const upstream = await fetch(`${UPSTREAM[ctx.provider]}/${path.join("/")}${req.nextUrl.search}`, {
    method: "POST",
    headers: forwardRequestHeaders(req.headers),
    body: JSON.stringify(body),
    signal: req.signal,
  });

  const headers = forwardResponseHeaders(upstream.headers);
  if (!upstream.ok || !upstream.body) {
    return new Response(upstream.body, { status: upstream.status, headers });
  }

  const [toClient, toMeter] = upstream.body.tee();
  const isStream = upstream.headers.get("content-type")?.includes("text/event-stream") ?? false;

  after(async () => {
    try {
      const text = await new Response(toMeter).text();
      const usage = isStream
        ? extractUsageFromSse(ctx.provider, text)
        : extractUsageFromJson(ctx.provider, JSON.parse(text));
      if (usage) await recordUsage(ctx, usage, { statusCode: upstream.status, latencyMs: Date.now() - started });
    } catch (e) {
      console.error("[proxy] metering failed", e);
    }
  });

  return new Response(toClient, { status: upstream.status, headers });
}

/** Pass-through for read-only endpoints like GET /v1/models. Not metered. */
export async function GET(req: NextRequest, { params }: Params) {
  const { provider, path } = await params;
  const resolved = await resolveContext(req, provider);
  if ("error" in resolved) return resolved.error;

  const upstream = await fetch(`${UPSTREAM[resolved.ctx.provider]}/${path.join("/")}${req.nextUrl.search}`, {
    headers: forwardRequestHeaders(req.headers),
  });
  return new Response(upstream.body, { status: upstream.status, headers: forwardResponseHeaders(upstream.headers) });
}
