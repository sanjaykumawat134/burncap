import { PLANS } from "@/lib/plans";
import type { Budget, Plan } from "@/types/domain";

/**
 * Re-applies plan limits at read time. Server actions already check them, but rows can also be
 * written directly through the Supabase API, so this is the enforcement that actually counts.
 */
export function withinPlan(budgets: Budget[], plan: Plan): Budget[] {
  const limits = PLANS[plan];
  return budgets
    .filter((b) => limits.customers || b.scope !== "customer")
    .slice(0, limits.budgets)
    .map((b) => (b.action === "throttle" && !limits.throttle ? { ...b, action: "alert" as const } : b));
}

/** Budgets that apply to a given request's attribution, after plan limits. */
export function applicableBudgets(budgets: Budget[], plan: Plan, agentId: string, customerId: string | null) {
  return withinPlan(budgets, plan).filter(
    (b) =>
      b.enabled &&
      (b.scope === "workspace" ||
        (b.scope === "agent" && b.scopeId === agentId) ||
        (b.scope === "customer" && customerId !== null && b.scopeId === customerId)),
  );
}

export const budgetScopeId = (b: Budget) => b.scopeId ?? "_";
