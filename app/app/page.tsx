import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

/** Sends the user to their first workspace. */
export default async function AppIndex() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!data) return <p className="p-6 text-sm">No workspace found. Contact support.</p>;
  redirect(`/w/${data.workspace_id}`);
}
