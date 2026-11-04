import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentSummary, DashboardData, DailySpend } from "@/types/domain";

/** Reads only usage_daily rollups (never raw events) so this stays fast. RLS scopes everything. */
export async function getDashboardData(supabase: SupabaseClient, workspaceId: string): Promise<DashboardData> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const from = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  const since = monthStart < from ? monthStart : from;

  const [usage, agents, budgets] = await Promise.all([
    supabase
      .from("usage_daily")
      .select("day, agent_id, requests, cost_micros")
      .eq("workspace_id", workspaceId)
      .gte("day", since),
    supabase.from("agents").select("id, display_name, status, last_seen_at").eq("workspace_id", workspaceId),
    supabase
      .from("budgets")
      .select("scope, scope_id, limit_micros")
      .eq("workspace_id", workspaceId)
      .eq("period", "monthly")
      .eq("enabled", true),
  ]);

  const rows = (usage.data ?? []).map((r) => ({ ...r, cost_micros: Number(r.cost_micros) }));

  const byDay = new Map<string, number>();
  for (let i = 29; i >= 0; i--) byDay.set(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10), 0);

  const agentStats = new Map<string, { today: number; month: number; reqToday: number }>();
  let spendToday = 0;
  let spendMonth = 0;
  let requestsToday = 0;

  for (const r of rows) {
    if (byDay.has(r.day)) byDay.set(r.day, byDay.get(r.day)! + r.cost_micros);
    const s = agentStats.get(r.agent_id) ?? { today: 0, month: 0, reqToday: 0 };
    if (r.day === today) {
      spendToday += r.cost_micros;
      requestsToday += r.requests;
      s.today += r.cost_micros;
      s.reqToday += r.requests;
    }
    if (r.day >= monthStart) {
      spendMonth += r.cost_micros;
      s.month += r.cost_micros;
    }
    agentStats.set(r.agent_id, s);
  }

  const monthly = budgets.data ?? [];
  const limitFor = (scope: string, id: string | null) => {
    const b = monthly.find((x) => x.scope === scope && x.scope_id === id);
    return b ? Number(b.limit_micros) : null;
  };

  const agentList: AgentSummary[] = (agents.data ?? [])
    .map((a) => {
      const s = agentStats.get(a.id) ?? { today: 0, month: 0, reqToday: 0 };
      return {
        id: a.id,
        displayName: a.display_name,
        status: a.status,
        spendTodayMicros: s.today,
        spendMonthMicros: s.month,
        requestsToday: s.reqToday,
        monthlyLimitMicros: limitFor("agent", a.id),
        lastSeenAt: a.last_seen_at,
      };
    })
    .sort((a, b) => b.spendMonthMicros - a.spendMonthMicros);

  const daily: DailySpend[] = [...byDay].map(([day, costMicros]) => ({ day, costMicros }));

  return {
    spendTodayMicros: spendToday,
    spendMonthMicros: spendMonth,
    workspaceMonthlyLimitMicros: limitFor("workspace", null),
    requestsToday,
    daily,
    agents: agentList,
  };
}
