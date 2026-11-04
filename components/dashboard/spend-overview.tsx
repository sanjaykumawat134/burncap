"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { setAgentStatus } from "@/lib/actions/agents";
import { usd, type AgentSummary, type DashboardData, type Micros } from "@/types/domain";

const fmt = (micros: Micros) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    usd(micros),
  );

const chartConfig = { cost: { label: "Spend ($)", color: "var(--chart-1)" } } satisfies ChartConfig;

export function SpendOverview({ workspaceId, data }: { workspaceId: string; data: DashboardData }) {
  const monthPct = data.workspaceMonthlyLimitMicros
    ? Math.min(100, (data.spendMonthMicros / data.workspaceMonthlyLimitMicros) * 100)
    : null;
  const chartData = data.daily.map((d) => ({ day: d.day.slice(5), cost: Number(usd(d.costMicros).toFixed(4)) }));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat title="Spend today" value={fmt(data.spendTodayMicros)} sub={`${data.requestsToday.toLocaleString()} requests`} />
        <Stat title="Spend this month" value={fmt(data.spendMonthMicros)} sub="Since the 1st (UTC)" />
        <Card>
          <CardHeader>
            <CardDescription>Monthly workspace budget</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {data.workspaceMonthlyLimitMicros ? fmt(data.workspaceMonthlyLimitMicros) : "No limit"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthPct !== null ? (
              <>
                <Progress value={monthPct} />
                <p className="mt-2 text-xs text-muted-foreground">{monthPct.toFixed(0)}% used</p>
              </>
            ) : (
              <Link href={`/w/${workspaceId}/budgets`} className="text-sm underline underline-offset-4">
                Set a budget →
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Daily spend</CardTitle>
            <CardDescription>Last 30 days (UTC)</CardDescription>
          </div>
          {/* Plain <a>: a file download, not a client-side navigation */}
          <a href={`/w/${workspaceId}/export`} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Export this month (CSV)
          </a>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-56 w-full">
            <BarChart data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `$${v}`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="cost" fill="var(--color-cost)" radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <AgentsTable workspaceId={workspaceId} agents={data.agents} />
    </div>
  );
}

function Stat({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function AgentsTable({ workspaceId, agents }: { workspaceId: string; agents: AgentSummary[] }) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(
    agents,
    (state, { id, status }: { id: string; status: AgentSummary["status"] }) =>
      state.map((a) => (a.id === id ? { ...a, status } : a)),
  );

  const toggle = (a: AgentSummary) => {
    const status = a.status === "active" ? "paused" : "active";
    startTransition(async () => {
      setOptimistic({ id: a.id, status });
      await setAgentStatus(workspaceId, a.id, status);
    });
  };

  if (!agents.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No agents yet</CardTitle>
          <CardDescription>
            Create an <Link href={`/w/${workspaceId}/keys`} className="underline underline-offset-4">API key</Link>, then
            route a request through the proxy with an <code>x-bc-agent</code> header.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agents</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Today</TableHead>
              <TableHead className="text-right">This month</TableHead>
              <TableHead className="hidden md:table-cell">Monthly budget</TableHead>
              <TableHead className="text-right">Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {optimistic.map((a) => {
              const pct = a.monthlyLimitMicros ? (a.spendMonthMicros / a.monthlyLimitMicros) * 100 : null;
              return (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="font-medium">{a.displayName ?? a.id}</div>
                    <div className="text-xs text-muted-foreground">
                      last seen {new Date(a.lastSeenAt).toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    {a.status === "paused" ? (
                      <Badge variant="destructive">Paused</Badge>
                    ) : pct !== null && pct >= 100 ? (
                      <Badge variant="destructive">Over budget</Badge>
                    ) : pct !== null && pct >= 80 ? (
                      <Badge variant="secondary">Near limit</Badge>
                    ) : (
                      <Badge variant="outline">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(a.spendTodayMicros)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(a.spendMonthMicros)}</TableCell>
                  <TableCell className="hidden w-40 md:table-cell">
                    {pct !== null ? (
                      <Progress value={Math.min(100, pct)} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch
                      checked={a.status === "active"}
                      onCheckedChange={() => toggle(a)}
                      disabled={pending}
                      aria-label={`${a.status === "active" ? "Pause" : "Resume"} ${a.id}`}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
