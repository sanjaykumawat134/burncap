export type Provider = "openai" | "anthropic";
export type Plan = "free" | "pro";
export type BudgetScope = "workspace" | "agent" | "customer";
export type BudgetPeriod = "daily" | "monthly";
export type BudgetAction = "alert" | "throttle" | "pause";
export type AgentStatus = "active" | "paused";
/** Integer micro-dollars: 1 USD = 1_000_000 */
export type Micros = number;

export interface Attribution {
  agentId: string;
  runId: string | null;
  customerId: string | null;
}

export interface RequestContext extends Attribution {
  workspaceId: string;
  plan: Plan;
  provider: Provider;
}

export interface Usage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
}

export interface Budget {
  id: string;
  workspaceId: string;
  scope: BudgetScope;
  scopeId: string | null;
  period: BudgetPeriod;
  limitMicros: Micros;
  action: BudgetAction;
  throttleRpm: number;
  alertThresholds: number[];
  enabled: boolean;
}

export type BudgetDecision =
  | { action: "allow" }
  | { action: "throttle"; budget: Budget; spentMicros: Micros }
  | { action: "pause"; reason: "budget" | "manual"; budget?: Budget; spentMicros?: Micros };

export interface ModelPrice {
  provider: Provider;
  model: string;
  inputPerMtokMicros: Micros;
  outputPerMtokMicros: Micros;
  cachedInputPerMtokMicros: Micros | null;
  cacheWritePerMtokMicros: Micros | null;
}

export interface AgentSummary {
  id: string;
  displayName: string | null;
  status: AgentStatus;
  spendTodayMicros: Micros;
  spendMonthMicros: Micros;
  requestsToday: number;
  monthlyLimitMicros: Micros | null;
  lastSeenAt: string;
}

export interface DailySpend {
  day: string;
  costMicros: Micros;
}

export interface DashboardData {
  spendTodayMicros: Micros;
  spendMonthMicros: Micros;
  workspaceMonthlyLimitMicros: Micros | null;
  requestsToday: number;
  daily: DailySpend[];
  agents: AgentSummary[];
}

export const usd = (m: Micros) => m / 1_000_000;
export const toMicros = (dollars: number) => Math.round(dollars * 1_000_000);
