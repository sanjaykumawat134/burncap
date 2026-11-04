import type { Plan } from "@/types/domain";

export const PLANS: Record<
  Plan,
  {
    requestsPerMonth: number;
    members: number;
    budgets: number;
    retentionDays: number;
    slack: boolean;
    throttle: boolean;
    customers: boolean;
  }
> = {
  free: { requestsPerMonth: 10_000, members: 1, budgets: 2, retentionDays: 7, slack: false, throttle: false, customers: false },
  pro: { requestsPerMonth: 500_000, members: 5, budgets: Infinity, retentionDays: 90, slack: true, throttle: true, customers: true },
};
