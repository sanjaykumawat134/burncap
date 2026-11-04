import Link from "next/link";
import { requireMember } from "@/lib/supabase/server";
import { PLANS } from "@/lib/plans";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { usd } from "@/types/domain";

const WINDOWS = { "24h": 1, "7d": 7, "30d": 30 } as const;
type Window = keyof typeof WINDOWS;

interface RunRow {
  run_id: string;
  agents: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cost_micros: number;
  started_at: string;
  ended_at: string;
}

const duration = (from: string, to: string) => {
  const s = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000);
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`;
};

export default async function RunsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ window?: string }>;
}) {
  const { workspaceId } = await params;
  const { window: w } = await searchParams;
  const { supabase, workspace } = await requireMember(workspaceId);

  const retention = PLANS[workspace.plan].retentionDays;
  const selected: Window = w && w in WINDOWS ? (w as Window) : "7d";
  const days = Math.min(WINDOWS[selected], retention);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data, error } = await supabase.rpc("top_runs", { p_ws: workspaceId, p_since: since, p_limit: 50 });
  const runs = (data ?? []) as RunRow[];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Most expensive runs</CardTitle>
            <CardDescription>
              Requests grouped by the <code>x-bc-run</code> header. Your plan keeps {retention} days of request history.
            </CardDescription>
          </div>
          <nav className="flex gap-1 text-sm">
            {(Object.keys(WINDOWS) as Window[]).map((key) => (
              <Link
                key={key}
                href={`?window=${key}`}
                className={cn(
                  "rounded-md px-2 py-1",
                  key === selected ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {key}
              </Link>
            ))}
          </nav>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {error ? (
            <p className="text-sm text-destructive">Couldn&apos;t load runs: {error.message}</p>
          ) : runs.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Tokens in / out</TableHead>
                  <TableHead className="hidden md:table-cell">Started</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.run_id}>
                    <TableCell className="max-w-48 truncate font-mono text-xs">{r.run_id}</TableCell>
                    <TableCell>{r.agents}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.requests).toLocaleString()}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {Number(r.input_tokens).toLocaleString()} / {Number(r.output_tokens).toLocaleString()}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {new Date(r.started_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{duration(r.started_at, r.ended_at)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">${usd(Number(r.cost_micros)).toFixed(4)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No runs in this window. Send an <code>x-bc-run</code> header (for example a task or session ID) to group requests.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
