import { NextRequest } from "next/server";
import { requireMember } from "@/lib/supabase/server";

/** Quotes a CSV field when needed (RFC 4180), and defuses spreadsheet formula injection. */
function cell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** GET /w/:id/export?month=2026-11 → daily spend per agent/customer/model for that month. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase, workspace } = await requireMember(workspaceId);

  const param = req.nextUrl.searchParams.get("month");
  const month = param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param) ? param : new Date().toISOString().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("usage_daily")
    .select("day, agent_id, customer_id, model, requests, input_tokens, output_tokens, cost_micros")
    .eq("workspace_id", workspaceId)
    .gte("day", `${month}-01`)
    .lt("day", next)
    .order("day");
  if (error) return new Response(error.message, { status: 500 });

  const header = ["day", "agent_id", "customer_id", "model", "requests", "input_tokens", "output_tokens", "cost_usd"];
  const lines = (data ?? []).map((r) =>
    [r.day, r.agent_id, r.customer_id, r.model, r.requests, r.input_tokens, r.output_tokens, (Number(r.cost_micros) / 1e6).toFixed(6)]
      .map(cell)
      .join(","),
  );
  const slug = workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";

  return new Response([header.join(","), ...lines].join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="burncap-${slug}-${month}.csv"`,
      "cache-control": "no-store",
    },
  });
}
