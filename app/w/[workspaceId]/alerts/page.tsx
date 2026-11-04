import { requireMember } from "@/lib/supabase/server";
import { deleteChannel, setChannelEnabled } from "@/lib/actions/alerts";
import { ChannelForm, TestAlertButton } from "@/components/alerts/channel-form";
import { PLANS } from "@/lib/plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Shows enough of a Slack webhook to recognise it without exposing the secret part. */
const mask = (type: string, target: string) =>
  type === "slack" ? target.replace(/^(https:\/\/hooks\.slack\.com\/services\/[^/]+\/).*$/, "$1…") : target;

export default async function AlertsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase, workspace } = await requireMember(workspaceId);
  const [{ data: channels }, { data: recent }] = await Promise.all([
    supabase.from("alert_channels").select("*").eq("workspace_id", workspaceId).order("created_at"),
    supabase
      .from("alert_events")
      .select("threshold, period_key, spent_micros, sent_at, budgets!inner(workspace_id, scope, scope_id, period)")
      .eq("budgets.workspace_id", workspaceId)
      .order("sent_at", { ascending: false })
      .limit(20),
  ]);
  const slackAllowed = PLANS[workspace.plan].slack;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Alert channels</CardTitle>
          <CardDescription>
            Budget alerts go to every enabled channel at 50%, 80% and 100%.
            {!slackAllowed && " Slack alerts need the Pro plan."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ChannelForm workspaceId={workspaceId} slackAllowed={slackAllowed} />
          {channels?.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {channels.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="capitalize">{c.type}</TableCell>
                      <TableCell className="max-w-xs truncate font-mono text-xs">{mask(c.type, c.target)}</TableCell>
                      <TableCell>
                        {c.enabled ? <Badge variant="outline">Enabled</Badge> : <Badge variant="secondary">Disabled</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <form action={setChannelEnabled.bind(null, workspaceId, c.id, !c.enabled)}>
                            <Button variant="ghost" size="sm" type="submit">
                              {c.enabled ? "Disable" : "Enable"}
                            </Button>
                          </form>
                          <form action={deleteChannel.bind(null, workspaceId, c.id)}>
                            <Button variant="destructive" size="sm" type="submit">
                              Delete
                            </Button>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No channels. Add one so you hear about budgets before they run out.</p>
          )}
          <TestAlertButton workspaceId={workspaceId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent alerts</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {recent?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Threshold</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((a, i) => {
                  const b = a.budgets as unknown as { scope: string; scope_id: string | null; period: string };
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-sm text-muted-foreground">{new Date(a.sent_at).toLocaleString()}</TableCell>
                      <TableCell>
                        {b.scope === "workspace" ? "Workspace" : `${b.scope}: ${b.scope_id}`} ({b.period})
                      </TableCell>
                      <TableCell>
                        <Badge variant={a.threshold >= 100 ? "destructive" : "outline"}>{a.threshold}%</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">${(Number(a.spent_micros) / 1e6).toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No alerts sent yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
