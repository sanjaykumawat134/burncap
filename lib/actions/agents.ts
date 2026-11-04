"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/supabase/server";
import { redis, keys } from "@/lib/redis";
import type { AgentStatus } from "@/types/domain";

export async function setAgentStatus(workspaceId: string, agentId: string, status: AgentStatus) {
  const { supabase } = await requireMember(workspaceId);
  const { data, error } = await supabase
    .from("agents")
    .update({ status })
    .eq("workspace_id", workspaceId)
    .eq("id", agentId)
    .select("id");
  if (error || !data?.length) throw new Error("Agent not found");

  // Redis is what the proxy reads; the DB row is for display
  if (status === "paused") await redis().set(keys.paused(workspaceId, agentId), 1);
  else await redis().del(keys.paused(workspaceId, agentId));

  revalidatePath(`/w/${workspaceId}`);
}
