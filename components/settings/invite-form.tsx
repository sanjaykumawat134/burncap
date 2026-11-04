"use client";

import { useActionState } from "react";
import { inviteMember, type InviteState } from "@/lib/actions/members";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteMember.bind(null, workspaceId), {});
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input name="email" type="email" required placeholder="teammate@example.com" aria-label="Email to invite" className="sm:max-w-xs" />
        <Button type="submit" disabled={pending}>
          {pending ? "Inviting…" : "Send invite"}
        </Button>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && <p className="text-sm text-muted-foreground">Invite sent.</p>}
    </form>
  );
}
