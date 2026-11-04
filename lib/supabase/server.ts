import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDemo } from "@/lib/demo";
import { demoSupabase } from "@/lib/demo/supabase";

function cookieClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a server component: middleware refreshes the session instead.
        }
      },
    },
  });
}

/** User-scoped client for server components and server actions (RLS applies). */
export async function supabaseServer(): Promise<ReturnType<typeof cookieClient>> {
  if (isDemo()) return demoSupabase() as unknown as ReturnType<typeof cookieClient>;
  return cookieClient(await cookies());
}

export async function requireUser() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return { supabase, user: data.user };
}

export interface WorkspaceRow {
  id: string;
  name: string;
  plan: "free" | "pro";
  stripe_customer_id: string | null;
}

/** Redirects unless the current user belongs to the workspace. Returns the user-scoped client. */
export async function requireMember(workspaceId: string) {
  const { supabase, user } = await requireUser();
  const [{ data: workspace }, { data: membership }] = await Promise.all([
    supabase.from("workspaces").select("id, name, plan, stripe_customer_id").eq("id", workspaceId).maybeSingle(),
    supabase.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!workspace || !membership) redirect("/app");
  return { supabase, user, workspace: workspace as WorkspaceRow, role: membership.role as "owner" | "member" };
}

/** Like requireMember, but throws for non-owners. Use in server actions that change billing or membership. */
export async function requireOwner(workspaceId: string) {
  const ctx = await requireMember(workspaceId);
  if (ctx.role !== "owner") throw new Error("Only the workspace owner can do this");
  return ctx;
}
