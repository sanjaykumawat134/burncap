import { requireMember } from "@/lib/supabase/server";
import { deleteBudget } from "@/lib/actions/budgets";
import { BudgetForm } from "@/components/budgets/budget-form";
import { PLANS } from "@/lib/plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usd } from "@/types/domain";

export default async function BudgetsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase, workspace } = await requireMember(workspaceId);
  const [{ data: budgets }, { data: agents }] = await Promise.all([
    supabase.from("budgets").select("*").eq("workspace_id", workspaceId).order("created_at"),
    supabase.from("agents").select("id").eq("workspace_id", workspaceId).order("id"),
  ]);
  const plan = PLANS[workspace.plan];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>New budget</CardTitle>
          <CardDescription>
            Periods reset at 00:00 UTC (daily) or on the 1st (monthly). Alerts go out at 50%, 80% and 100%.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BudgetForm
            workspaceId={workspaceId}
            agentIds={(agents ?? []).map((a) => a.id)}
            allowThrottle={plan.throttle}
            allowCustomer={plan.customers}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Budgets</CardTitle>
          <CardDescription>
            {budgets?.length ?? 0} of {Number.isFinite(plan.budgets) ? plan.budgets : "unlimited"} used on the{" "}
            {workspace.plan} plan
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {budgets?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applies to</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Limit</TableHead>
                  <TableHead>When exceeded</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgets.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      {b.scope === "workspace" ? "Whole workspace" : (
                        <>
                          <span className="text-muted-foreground">{b.scope}:</span>{" "}
                          <span className="font-mono">{b.scope_id}</span>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">{b.period}</TableCell>
                    <TableCell className="text-right tabular-nums">${usd(Number(b.limit_micros)).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={b.action === "pause" ? "destructive" : b.action === "throttle" ? "secondary" : "outline"}>
                        {b.action === "throttle" ? `throttle ${b.throttle_rpm}/min` : b.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={deleteBudget.bind(null, workspaceId, b.id)}>
                        <Button variant="ghost" size="sm" type="submit">
                          Delete
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No budgets yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
