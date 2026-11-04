import { NextRequest } from "next/server";
import { authenticateKey } from "@/lib/auth/api-key";
import { redis, keys } from "@/lib/redis";
import { checkBudgets } from "@/lib/budgets/check";
import { periodKey } from "@/lib/budgets/periods";
import { proxyError } from "@/lib/proxy/providers";
import { usd } from "@/types/domain";

export const runtime = "nodejs";

/**
 * Lets an agent check whether it may run before starting a long task.
 * Pass ?customer=… to include that customer's budgets.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const owner = await authenticateKey(req.headers.get("x-bc-key"));
  if (!owner) return proxyError(401, "invalid_burncap_key", "Missing or invalid x-bc-key header");

  const [decision, today, month] = await Promise.all([
    checkBudgets(
      {
        workspaceId: owner.id,
        plan: owner.plan,
        provider: "openai", // budgets aren't per-provider; required by the context type only
        agentId,
        runId: null,
        customerId: req.nextUrl.searchParams.get("customer"),
      },
      { dryRun: true },
    ),
    redis().get<number>(keys.spend(owner.id, "agent", agentId, periodKey("daily"))),
    redis().get<number>(keys.spend(owner.id, "agent", agentId, periodKey("monthly"))),
  ]);

  const status = decision.action === "pause" ? "paused" : decision.action === "throttle" ? "throttled" : "active";
  const reason =
    decision.action === "pause" && decision.reason === "manual"
      ? "paused_manually"
      : decision.action !== "allow"
        ? `${decision.budget!.scope}_${decision.budget!.period}_budget`
        : null;

  return Response.json({
    agent_id: agentId,
    status,
    reason,
    spent_today_usd: usd(Number(today ?? 0)),
    spent_month_usd: usd(Number(month ?? 0)),
  });
}
