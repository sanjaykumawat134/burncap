import { requireMember } from "@/lib/supabase/server";
import { revokeKey } from "@/lib/actions/keys";
import { CreateKeyForm } from "@/components/keys/create-key-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function KeysPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase } = await requireMember(workspaceId);
  const { data: keys } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, last_used_at, created_at")
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            Send this key in the <code>x-bc-key</code> header. Your provider key (OpenAI/Anthropic) passes through
            untouched and is never stored.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CreateKeyForm workspaceId={workspaceId} />
          {keys?.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((k) => (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell className="font-mono text-xs">{k.key_prefix}…</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <form action={revokeKey.bind(null, workspaceId, k.id)}>
                          <Button variant="destructive" size="sm" type="submit">
                            Revoke
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quickstart</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Snippet title="Claude Code">
            {`export ANTHROPIC_BASE_URL=${appUrl}/api/v1/anthropic
export ANTHROPIC_CUSTOM_HEADERS="x-bc-key: bc_live_…
x-bc-agent: claude-code"`}
          </Snippet>
          <Snippet title="Python (OpenAI SDK, also LangChain / CrewAI)">
            {`from openai import OpenAI
client = OpenAI(
    base_url="${appUrl}/api/v1/openai/v1",
    default_headers={"x-bc-key": "bc_live_…", "x-bc-agent": "researcher"},
)`}
          </Snippet>
          <Snippet title="TypeScript (Anthropic SDK)">
            {`const client = new Anthropic({
  baseURL: "${appUrl}/api/v1/anthropic",
  defaultHeaders: { "x-bc-key": "bc_live_…", "x-bc-agent": "support-bot", "x-bc-run": runId },
});`}
          </Snippet>
          <p className="text-muted-foreground">
            Optional headers: <code>x-bc-run</code> (group calls into a run), <code>x-bc-customer</code> (attribute
            spend to your customer). A blocked agent gets HTTP <code>402 budget_exceeded</code>; a throttled one gets{" "}
            <code>429</code> with <code>retry-after</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Snippet({ title, children }: { title: string; children: string }) {
  return (
    <div className="space-y-1.5">
      <p className="font-medium">{title}</p>
      <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs">{children}</pre>
    </div>
  );
}
