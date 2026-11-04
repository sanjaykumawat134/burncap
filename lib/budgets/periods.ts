import type { BudgetPeriod } from "@/types/domain";

/** UTC period keys: "d:2026-11-03" / "m:2026-11". */
export const periodKey = (period: BudgetPeriod, d = new Date()) =>
  period === "daily" ? `d:${d.toISOString().slice(0, 10)}` : `m:${d.toISOString().slice(0, 7)}`;

/** Counter TTL: a little longer than the period so late reads still work. */
export const periodTtlSeconds = (period: BudgetPeriod) => (period === "daily" ? 2 * 86_400 : 35 * 86_400);
