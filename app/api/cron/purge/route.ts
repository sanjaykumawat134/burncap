import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PLANS } from "@/lib/plans";
import type { Plan } from "@/types/domain";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Nightly: delete raw usage_events past each plan's retention. Daily rollups are kept. */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const deleted: Record<string, number> = {};
  for (const [plan, limits] of Object.entries(PLANS) as [Plan, (typeof PLANS)[Plan]][]) {
    const { data, error } = await supabaseAdmin().rpc("purge_usage_events", { p_plan: plan, p_days: limits.retentionDays });
    if (error) return Response.json({ error: error.message, deleted }, { status: 500 });
    deleted[plan] = Number(data);
  }
  return Response.json({ deleted });
}
