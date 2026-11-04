"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";
import { invalidateBudgets } from "@/lib/budgets/cache";
import { PLANS } from "@/lib/plans";
import { toMicros } from "@/types/domain";

const BudgetInput = z
  .object({
    scope: z.enum(["workspace", "agent", "customer"]),
    scopeId: z.string().trim().max(128).optional(),
    period: z.enum(["daily", "monthly"]),
    limitUsd: z.coerce.number().positive().max(1_000_000),
    action: z.enum(["alert", "throttle", "pause"]),
    throttleRpm: z.coerce.number().int().min(1).max(600).default(5),
  })
  .refine((b) => b.scope === "workspace" || !!b.scopeId, {
    message: "Agent or customer ID is required for this scope",
    path: ["scopeId"],
  });

export type BudgetFormState = { ok?: boolean; error?: string };

export async function createBudget(workspaceId: string, _prev: BudgetFormState, formData: FormData): Promise<BudgetFormState> {
  const parsed = BudgetInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const b = parsed.data;

  const { supabase, workspace } = await requireMember(workspaceId);
  const plan = PLANS[workspace.plan];
  if (b.action === "throttle" && !plan.throttle) return { error: "Throttling is a Pro feature" };
  if (b.scope === "customer" && !plan.customers) return { error: "Customer budgets are a Pro feature" };

  const { count } = await supabase
    .from("budgets")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  if ((count ?? 0) >= plan.budgets) return { error: `Your plan allows ${plan.budgets} budgets. Upgrade to Pro for more.` };

  const { error } = await supabase.from("budgets").insert({
    workspace_id: workspaceId,
    scope: b.scope,
    scope_id: b.scope === "workspace" ? null : b.scopeId,
    period: b.period,
    limit_micros: toMicros(b.limitUsd),
    action: b.action,
    throttle_rpm: b.throttleRpm,
  });
  if (error) return { error: error.message };

  await invalidateBudgets(workspaceId);
  revalidatePath(`/w/${workspaceId}`, "layout");
  return { ok: true };
}

export async function deleteBudget(workspaceId: string, budgetId: string) {
  const { supabase } = await requireMember(workspaceId);
  await supabase.from("budgets").delete().eq("workspace_id", workspaceId).eq("id", budgetId);
  await invalidateBudgets(workspaceId);
  revalidatePath(`/w/${workspaceId}`, "layout");
}
