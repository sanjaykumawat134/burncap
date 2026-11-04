import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { keys } from "@/lib/redis";
import { sendEmail, sendSlack, type AlertMessage } from "@/lib/notify";
import { getBudgets } from "./cache";
import { applicableBudgets, budgetScopeId } from "./scope";
import { periodKey } from "./periods";
import { usd, type Budget, type Micros, type RequestContext } from "@/types/domain";

const fmt = (m: Micros) => `$${usd(m).toFixed(2)}`;

function describe(b: Budget, threshold: number, spent: Micros): AlertMessage {
  const target = b.scope === "workspace" ? "Workspace" : `${b.scope === "agent" ? "Agent" : "Customer"} "${b.scopeId}"`;
  const verb = threshold >= 100 ? "exceeded" : `reached ${threshold}% of`;
  const consequence =
    threshold >= 100 && b.action === "pause"
      ? "Requests are now blocked (HTTP 402) until the period resets."
      : threshold >= 100 && b.action === "throttle"
        ? `Requests are now throttled to ${b.throttleRpm}/min until the period resets.`
        : "";
  return {
    subject: `[BurnCap] ${target} ${verb} its ${b.period} budget`,
    text: `${target} has spent ${fmt(spent)} of its ${fmt(b.limitMicros)} ${b.period} budget. ${consequence}`.trim(),
  };
}

/**
 * Called after each request with the post-increment Redis totals.
 * Only does DB work when a threshold is crossed by this request; the alert_events
 * primary key makes the send exactly-once even under concurrent requests.
 */
export async function evaluateAlerts(ctx: RequestContext, totals: Map<string, Micros>, cost: Micros) {
  if (cost <= 0) return;
  const budgets = applicableBudgets(await getBudgets(ctx.workspaceId), ctx.plan, ctx.agentId, ctx.customerId);

  for (const b of budgets) {
    const pk = periodKey(b.period);
    const spent = totals.get(keys.spend(ctx.workspaceId, b.scope, budgetScopeId(b), pk));
    if (spent === undefined) continue;
    const before = spent - cost;

    for (const t of b.alertThresholds) {
      const line = (b.limitMicros * t) / 100;
      if (!(before < line && spent >= line)) continue;

      const { data } = await supabaseAdmin()
        .from("alert_events")
        .upsert(
          { budget_id: b.id, period_key: pk, threshold: t, spent_micros: spent },
          { onConflict: "budget_id,period_key,threshold", ignoreDuplicates: true },
        )
        .select();
      if (!data?.length) continue; // another request already sent it

      await notifyWorkspace(ctx.workspaceId, describe(b, t, spent), ctx.plan === "pro");
    }
  }
}

export async function notifyWorkspace(workspaceId: string, msg: AlertMessage, allowSlack: boolean) {
  const { data: channels } = await supabaseAdmin()
    .from("alert_channels")
    .select("type, target")
    .eq("workspace_id", workspaceId)
    .eq("enabled", true);

  await Promise.allSettled(
    (channels ?? []).map((c) =>
      c.type === "email" ? sendEmail(c.target, msg) : allowSlack ? sendSlack(c.target, msg) : Promise.resolve(),
    ),
  );
}
