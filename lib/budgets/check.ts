import "server-only";
import { redis, ratelimitFor, keys } from "@/lib/redis";
import { getBudgets } from "./cache";
import { applicableBudgets, budgetScopeId } from "./scope";
import { periodKey } from "./periods";
import type { BudgetDecision, RequestContext } from "@/types/domain";

/**
 * Pre-request enforcement. Costs one or two Redis round trips.
 * With `dryRun`, reports state without consuming a throttle token: an agent over a throttle
 * budget is reported as throttled even if its next request would fit in the rate limit.
 */
export async function checkBudgets(ctx: RequestContext, opts: { dryRun?: boolean } = {}): Promise<BudgetDecision> {
  if (await redis().exists(keys.paused(ctx.workspaceId, ctx.agentId))) {
    return { action: "pause", reason: "manual" };
  }

  const budgets = applicableBudgets(await getBudgets(ctx.workspaceId), ctx.plan, ctx.agentId, ctx.customerId).filter(
    (b) => b.action !== "alert",
  );
  if (!budgets.length) return { action: "allow" };

  const spent = (
    await redis().mget<(number | null)[]>(
      ...budgets.map((b) => keys.spend(ctx.workspaceId, b.scope, budgetScopeId(b), periodKey(b.period))),
    )
  ).map((v) => Number(v ?? 0));

  const over = budgets.map((b, i) => ({ b, s: spent[i] })).filter(({ b, s }) => s >= b.limitMicros);

  const pause = over.find(({ b }) => b.action === "pause");
  if (pause) return { action: "pause", reason: "budget", budget: pause.b, spentMicros: pause.s };

  const throttle = over.find(({ b }) => b.action === "throttle");
  if (throttle) {
    if (opts.dryRun) return { action: "throttle", budget: throttle.b, spentMicros: throttle.s };
    const { success } = await ratelimitFor(throttle.b.throttleRpm).limit(`${ctx.workspaceId}:${ctx.agentId}`);
    if (!success) return { action: "throttle", budget: throttle.b, spentMicros: throttle.s };
  }
  return { action: "allow" };
}
