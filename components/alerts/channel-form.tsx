"use client";

import { useActionState, useState } from "react";
import { addChannel, sendTestAlert, type ChannelFormState } from "@/lib/actions/alerts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function ChannelForm({ workspaceId, slackAllowed }: { workspaceId: string; slackAllowed: boolean }) {
  const [state, action, pending] = useActionState<ChannelFormState, FormData>(addChannel.bind(null, workspaceId), {});
  const [type, setType] = useState("email");

  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select name="type" className={selectClass} value={type} onChange={(e) => setType(e.target.value)} aria-label="Channel type">
          <option value="email">Email</option>
          <option value="slack" disabled={!slackAllowed}>
            Slack{slackAllowed ? "" : " (Pro)"}
          </option>
        </select>
        <Input
          name="target"
          required
          type={type === "email" ? "email" : "url"}
          placeholder={type === "email" ? "team@example.com" : "https://hooks.slack.com/services/…"}
          aria-label="Destination"
          className="sm:max-w-md"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add channel"}
        </Button>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {type === "slack" && (
        <p className="text-xs text-muted-foreground">
          In Slack: Apps → Incoming Webhooks → Add to a channel, then paste the webhook URL here.
        </p>
      )}
    </form>
  );
}

export function TestAlertButton({ workspaceId }: { workspaceId: string }) {
  const [state, action, pending] = useActionState<ChannelFormState>(sendTestAlert.bind(null, workspaceId), {});
  return (
    <form action={action} className="flex items-center gap-3">
      <Button variant="outline" size="sm" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send test alert"}
      </Button>
      {state.ok && <span className="text-sm text-muted-foreground">Sent to all enabled channels.</span>}
    </form>
  );
}
