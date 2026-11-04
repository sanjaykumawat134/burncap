import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isDemo } from "@/lib/demo";
import { demoSupabase } from "@/lib/demo/supabase";

let client: SupabaseClient | null = null;

/** Service-role client: bypasses RLS. Only for the proxy, crons and webhooks. */
export function supabaseAdmin(): SupabaseClient {
  if (isDemo()) return demoSupabase();
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
