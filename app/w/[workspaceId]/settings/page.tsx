import { requireMember } from "@/lib/supabase/server";
import { removeMember, revokeInvite } from "@/lib/actions/members";
import { openBillingPortal, startCheckout } from "@/lib/actions/billing";
import { InviteForm } from "@/components/settings/invite-form";
import { PLANS } from "@/lib/plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PRO_FEATURES = [
  "500,000 tracked requests / month",
  "Up to 5 members",
  "Unlimited budgets",
  "Throttling and Slack alerts",
  "Per-customer budgets",
  "90-day request history",
];

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ billing?: string }>;
}) {
  const { workspaceId } = await params;
  const { billing } = await searchParams;
  const { supabase, user, workspace, role } = await requireMember(workspaceId);
  const isOwner = role === "owner";

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.rpc("workspace_members_with_email", { p_ws: workspaceId }),
    supabase
      .from("workspace_invites")
      .select("id, email, created_at")
      .eq("workspace_id", workspaceId)
      .is("accepted_at", null)
      .order("created_at"),
  ]);
  const plan = PLANS[workspace.plan];
  const memberRows = (members ?? []) as { user_id: string; email: string; role: string }[];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Plan
            <Badge variant={workspace.plan === "pro" ? "default" : "outline"} className="uppercase">
              {workspace.plan}
            </Badge>
          </CardTitle>
          <CardDescription>
            {plan.requestsPerMonth.toLocaleString()} tracked requests / month · {plan.members} member
            {plan.members === 1 ? "" : "s"} · {plan.retentionDays}-day history
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {billing === "success" && (
            <p className="text-sm">
              Thanks for upgrading! If the plan still shows Free, refresh in a few seconds while Stripe confirms the payment.
            </p>
          )}
          {workspace.plan === "free" ? (
            <>
              <ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                {PRO_FEATURES.map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              {isOwner ? (
                <form action={startCheckout.bind(null, workspaceId)}>
                  <Button type="submit">Upgrade to Pro: $29/month</Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">Ask the workspace owner to upgrade.</p>
              )}
            </>
          ) : (
            isOwner &&
            workspace.stripe_customer_id && (
              <form action={openBillingPortal.bind(null, workspaceId)}>
                <Button variant="outline" type="submit">
                  Manage billing
                </Button>
              </form>
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {memberRows.length + (invites?.length ?? 0)} of {plan.members} seats used
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isOwner && <InviteForm workspaceId={workspaceId} />}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberRows.map((m) => (
                  <TableRow key={m.user_id}>
                    <TableCell>
                      {m.email}
                      {m.user_id === user.id && <span className="text-muted-foreground"> (you)</span>}
                    </TableCell>
                    <TableCell className="capitalize">{m.role}</TableCell>
                    <TableCell className="text-right">
                      {isOwner && m.user_id !== user.id && (
                        <form action={removeMember.bind(null, workspaceId, m.user_id)}>
                          <Button variant="ghost" size="sm" type="submit">
                            Remove
                          </Button>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {invites?.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">Invited</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {isOwner && (
                        <form action={revokeInvite.bind(null, workspaceId, i.id)}>
                          <Button variant="ghost" size="sm" type="submit">
                            Revoke
                          </Button>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
