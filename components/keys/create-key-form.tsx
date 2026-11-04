"use client";

import { useActionState, useState } from "react";
import { createKey, type CreateKeyState } from "@/lib/actions/keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateKeyForm({ workspaceId }: { workspaceId: string }) {
  const [state, action, pending] = useActionState<CreateKeyState, FormData>(createKey.bind(null, workspaceId), {});
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        <Input name="name" placeholder="Key name, e.g. production" required maxLength={64} className="sm:max-w-xs" />
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create key"}
        </Button>
      </form>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.key && (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-sm font-medium">Copy this key now. You won&apos;t see it again.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <code className="flex-1 overflow-x-auto rounded bg-background px-2 py-1.5 font-mono text-xs">{state.key}</code>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(state.key!);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
