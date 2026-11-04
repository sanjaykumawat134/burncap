import Link from "next/link";
import { requireMember } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";
import { isDemo } from "@/lib/demo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { supabase, workspace, user } = await requireMember(workspaceId);
  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(name)")
    .eq("user_id", user.id)
    .order("created_at");
  const others = (memberships ?? [])
    .filter((m) => m.workspace_id !== workspaceId)
    .map((m) => ({ id: m.workspace_id, name: (m.workspaces as unknown as { name: string }).name }));

  const base = `/w/${workspaceId}`;
  const nav = [
    { href: base, label: "Dashboard" },
    { href: `${base}/runs`, label: "Runs" },
    { href: `${base}/budgets`, label: "Budgets" },
    { href: `${base}/alerts`, label: "Alerts" },
    { href: `${base}/keys`, label: "API keys" },
    { href: `${base}/settings`, label: "Settings" },
  ];

  return (
    <div className="min-h-screen">
      {isDemo() && (
        <div className="bg-amber-500/15 px-4 py-1.5 text-center text-xs">
          Demo mode: sample data in memory, resets when the dev server restarts. Emails and Slack messages are only logged.
        </div>
      )}
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href={base} className="font-semibold">
            BurnCap
          </Link>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {others.length ? (
              <details className="relative">
                <summary className="cursor-pointer list-none hover:text-foreground">{workspace.name} ▾</summary>
                <div className="absolute z-10 mt-2 min-w-48 rounded-lg border bg-background p-1 shadow-md">
                  {others.map((w) => (
                    <Link key={w.id} href={`/w/${w.id}`} className="block rounded-md px-2 py-1.5 hover:bg-muted">
                      {w.name}
                    </Link>
                  ))}
                </div>
              </details>
            ) : (
              workspace.name
            )}
            <Badge variant="outline" className="uppercase">
              {workspace.plan}
            </Badge>
          </div>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="text-muted-foreground hover:text-foreground">
                {n.label}
              </Link>
            ))}
          </nav>
          <form action={signOut} className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">{user.email}</span>
            <Button variant="ghost" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl">{children}</main>
    </div>
  );
}
