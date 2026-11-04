import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { redis, keys } from "@/lib/redis";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Plan } from "@/types/domain";

const PREFIX = "bc_live_";
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export function generateKey() {
  const bytes = randomBytes(32);
  const body = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  const key = PREFIX + body;
  return { key, hash: hashKey(key), prefix: key.slice(0, PREFIX.length + 4) };
}

export interface KeyOwner {
  id: string;
  plan: Plan;
}

/** Resolves a proxy key to its workspace. Cached in Redis for 60s; revocation deletes the cache entry. */
export async function authenticateKey(key: string | null): Promise<KeyOwner | null> {
  if (!key?.startsWith(PREFIX)) return null;
  const hash = hashKey(key);

  const cached = await redis().get<KeyOwner | "none">(keys.apiKey(hash));
  if (cached === "none") return null;
  if (cached) return cached;

  const { data } = await supabaseAdmin()
    .from("api_keys")
    .select("id, workspace_id, workspaces(plan)")
    .eq("key_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();

  const owner: KeyOwner | null = data
    ? { id: data.workspace_id, plan: (data.workspaces as unknown as { plan: Plan }).plan }
    : null;
  await redis().set(keys.apiKey(hash), owner ?? "none", { ex: 60 });

  if (data) {
    // Fire-and-forget; precision doesn't matter
    void supabaseAdmin().from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  }
  return owner;
}
