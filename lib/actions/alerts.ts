"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";
import { notifyWorkspace } from "@/lib/budgets/alerts";
import { PLANS } from "@/lib/plans";

const ChannelInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("email"), target: z.email("Enter a valid email address") }),
  z.object({
    type: z.literal("slack"),
    target: z.url().startsWith("https://hooks.slack.com/", "Use a Slack incoming webhook URL (https://hooks.slack.com/…)"),
  }),
]);

export type ChannelFormState = { ok?: boolean; error?: string };

export async function addChannel(workspaceId: string, _prev: ChannelFormState, formData: FormData): Promise<ChannelFormState> {
  const parsed = ChannelInput.safeParse({ type: formData.get("type"), target: String(formData.get("target") ?? "").trim() });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase, workspace } = await requireMember(workspaceId);
  if (parsed.data.type === "slack" && !PLANS[workspace.plan].slack) return { error: "Slack alerts are a Pro feature" };

  const { error } = await supabase
    .from("alert_channels")
    .insert({ workspace_id: workspaceId, type: parsed.data.type, target: parsed.data.target });
  if (error) return { error: error.message };

  revalidatePath(`/w/${workspaceId}/alerts`);
  return { ok: true };
}

export async function setChannelEnabled(workspaceId: string, channelId: string, enabled: boolean) {
  const { supabase } = await requireMember(workspaceId);
  await supabase.from("alert_channels").update({ enabled }).eq("workspace_id", workspaceId).eq("id", channelId);
  revalidatePath(`/w/${workspaceId}/alerts`);
}

export async function deleteChannel(workspaceId: string, channelId: string) {
  const { supabase } = await requireMember(workspaceId);
  await supabase.from("alert_channels").delete().eq("workspace_id", workspaceId).eq("id", channelId);
  revalidatePath(`/w/${workspaceId}/alerts`);
}

export async function sendTestAlert(workspaceId: string): Promise<ChannelFormState> {
  const { workspace } = await requireMember(workspaceId);
  await notifyWorkspace(
    workspaceId,
    { subject: "[BurnCap] Test alert", text: `This is a test alert for ${workspace.name}. Budget alerts will arrive here.` },
    PLANS[workspace.plan].slack,
  );
  return { ok: true };
}
