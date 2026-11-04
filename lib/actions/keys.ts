"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";
import { generateKey } from "@/lib/auth/api-key";
import { redis, keys } from "@/lib/redis";

export type CreateKeyState = { key?: string; error?: string };

export async function createKey(workspaceId: string, _prev: CreateKeyState, formData: FormData): Promise<CreateKeyState> {
  const name = z.string().trim().min(1).max(64).safeParse(formData.get("name"));
  if (!name.success) return { error: "Give the key a name (1–64 characters)" };

  const { supabase } = await requireMember(workspaceId);
  const { key, hash, prefix } = generateKey();
  const { error } = await supabase
    .from("api_keys")
    .insert({ workspace_id: workspaceId, name: name.data, key_prefix: prefix, key_hash: hash });
  if (error) return { error: error.message };

  revalidatePath(`/w/${workspaceId}/keys`);
  return { key };
}

export async function revokeKey(workspaceId: string, keyId: string) {
  const { supabase } = await requireMember(workspaceId);
  const { data } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", keyId)
    .select("key_hash")
    .maybeSingle();
  if (data) await redis().del(keys.apiKey(data.key_hash));
  revalidatePath(`/w/${workspaceId}/keys`);
}
