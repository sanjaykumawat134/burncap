"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner, requireUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashKey } from "@/lib/auth/api-key";
import { sendEmail } from "@/lib/notify";
import { PLANS } from "@/lib/plans";

export type InviteState = { ok?: boolean; error?: string };

export async function inviteMember(workspaceId: string, _prev: InviteState, formData: FormData): Promise<InviteState> {
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { error: "Enter a valid email address" };

  const { supabase, user, workspace } = await requireOwner(workspaceId);
  if (email.data === user.email?.toLowerCase()) return { error: "You're already a member" };

  const [{ count: members }, { count: pending }] = await Promise.all([
    supabase.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase
      .from("workspace_invites")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("accepted_at", null)
      .neq("email", email.data),
  ]);
  const limit = PLANS[workspace.plan].members;
  if ((members ?? 0) + (pending ?? 0) >= limit) {
    return { error: `Your plan allows ${limit} member${limit === 1 ? "" : "s"}. Upgrade to Pro to invite your team.` };
  }

  const token = randomBytes(24).toString("base64url");
  // Re-inviting the same email issues a fresh token and invalidates the old link
  const { error } = await supabase.from("workspace_invites").upsert(
    { workspace_id: workspaceId, email: email.data, token_hash: hashKey(token), invited_by: user.id, accepted_at: null },
    { onConflict: "workspace_id,email" },
  );
  if (error) return { error: error.message };

  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/invite/${token}`;
  await sendEmail(email.data, {
    subject: `You're invited to ${workspace.name} on BurnCap`,
    text: `${user.email} invited you to the "${workspace.name}" workspace on BurnCap.\n\nAccept the invite: ${link}`,
  });

  revalidatePath(`/w/${workspaceId}/settings`);
  return { ok: true };
}

export async function revokeInvite(workspaceId: string, inviteId: string) {
  const { supabase } = await requireOwner(workspaceId);
  await supabase.from("workspace_invites").delete().eq("workspace_id", workspaceId).eq("id", inviteId);
  revalidatePath(`/w/${workspaceId}/settings`);
}

export async function removeMember(workspaceId: string, userId: string) {
  const { user } = await requireOwner(workspaceId);
  if (userId === user.id) throw new Error("The owner can't remove themselves");
  // Members can't delete membership rows through RLS, so use the admin client after the owner check
  await supabaseAdmin().from("workspace_members").delete().eq("workspace_id", workspaceId).eq("user_id", userId);
  revalidatePath(`/w/${workspaceId}/settings`);
}

export async function acceptInvite(token: string) {
  const { user } = await requireUser();
  const db = supabaseAdmin();
  const { data: invite } = await db
    .from("workspace_invites")
    .select("id, workspace_id, email, accepted_at")
    .eq("token_hash", hashKey(token))
    .maybeSingle();

  if (!invite || invite.accepted_at) throw new Error("This invite is no longer valid");
  if (invite.email !== user.email?.toLowerCase()) throw new Error("This invite was sent to a different email address");

  const { error } = await db
    .from("workspace_members")
    .upsert({ workspace_id: invite.workspace_id, user_id: user.id, role: "member" }, { onConflict: "workspace_id,user_id", ignoreDuplicates: true });
  if (error) throw error;
  await db.from("workspace_invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);

  redirect(`/w/${invite.workspace_id}`);
}
