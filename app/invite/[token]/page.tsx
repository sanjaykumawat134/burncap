import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashKey } from "@/lib/auth/api-key";
import { acceptInvite } from "@/lib/actions/members";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: auth } = await (await supabaseServer()).auth.getUser();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  const { data: invite } = await supabaseAdmin()
    .from("workspace_invites")
    .select("email, accepted_at, workspaces(name)")
    .eq("token_hash", hashKey(token))
    .maybeSingle();

  const workspaceName = (invite?.workspaces as unknown as { name: string } | null)?.name;
  const problem = !invite || invite.accepted_at
    ? "This invite link is invalid or has already been used."
    : invite.email !== auth.user.email?.toLowerCase()
      ? `This invite was sent to ${invite.email}, but you're signed in as ${auth.user.email}.`
      : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{problem ? "Can't accept invite" : `Join ${workspaceName}`}</CardTitle>
          <CardDescription>{problem ?? "You'll be able to see spend, manage agents and set budgets."}</CardDescription>
        </CardHeader>
        <CardContent>
          {problem ? (
            <Link href="/app" className={buttonVariants({ variant: "outline" })}>
              Go to my workspace
            </Link>
          ) : (
            <form action={acceptInvite.bind(null, token)}>
              <Button type="submit" className="w-full">
                Accept invite
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
