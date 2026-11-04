import "server-only";
import { redis, keys } from "@/lib/redis";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Budget } from "@/types/domain";

/** Enabled budgets for a workspace, cached in Redis. Call invalidateBudgets() after any change. */
export async function getBudgets(workspaceId: string): Promise<Budget[]> {
  const cached = await redis().get<Budget[]>(keys.budgets(workspaceId));
  if (cached) return cached;

  const { data, error } = await supabaseAdmin()
    .from("budgets")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("enabled", true)
    .order("created_at");
  if (error) throw error;

  const budgets: Budget[] = (data ?? []).map((b) => ({
    id: b.id,
    workspaceId: b.workspace_id,
    scope: b.scope,
    scopeId: b.scope_id,
    period: b.period,
    limitMicros: Number(b.limit_micros),
    action: b.action,
    throttleRpm: b.throttle_rpm,
    alertThresholds: b.alert_thresholds,
    enabled: b.enabled,
  }));
  await redis().set(keys.budgets(workspaceId), budgets, { ex: 300 });
  return budgets;
}

export async function invalidateBudgets(workspaceId: string) {
  await redis().del(keys.budgets(workspaceId));
}
