import { requireMember } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/queries/dashboard";
import { SpendOverview } from "@/components/dashboard/spend-overview";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";

export default async function DashboardPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase } = await requireMember(workspaceId);
  const data = await getDashboardData(supabase, workspaceId);

  return (
    <>
      <AutoRefresh seconds={10} />
      <SpendOverview workspaceId={workspaceId} data={data} />
    </>
  );
}
