"use client";

import { useActionState, useState } from "react";
import { createBudget, type BudgetFormState } from "@/lib/actions/budgets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function BudgetForm({
  workspaceId,
  agentIds,
  allowThrottle,
  allowCustomer,
}: {
  workspaceId: string;
  agentIds: string[];
  allowThrottle: boolean;
  allowCustomer: boolean;
}) {
  const [state, action, pending] = useActionState<BudgetFormState, FormData>(createBudget.bind(null, workspaceId), {});
  const [scope, setScope] = useState("workspace");
  const [budgetAction, setBudgetAction] = useState("pause");

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Applies to" htmlFor="scope">
        <select id="scope" name="scope" className={selectClass} value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="workspace">Whole workspace</option>
          <option value="agent">One agent</option>
          <option value="customer" disabled={!allowCustomer}>
            One customer{allowCustomer ? "" : " (Pro)"}
          </option>
        </select>
      </Field>

      {scope !== "workspace" && (
        <Field label={scope === "agent" ? "Agent ID" : "Customer ID"} htmlFor="scopeId">
          <Input id="scopeId" name="scopeId" list="agent-ids" required placeholder={scope === "agent" ? "claude-code" : "cus_123"} />
          {scope === "agent" && (
            <datalist id="agent-ids">
              {agentIds.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          )}
        </Field>
      )}

      <Field label="Period" htmlFor="period">
        <select id="period" name="period" className={selectClass} defaultValue="daily">
          <option value="daily">Daily</option>
          <option value="monthly">Monthly</option>
        </select>
      </Field>

      <Field label="Limit (USD)" htmlFor="limitUsd">
        <Input id="limitUsd" name="limitUsd" type="number" min="0.01" step="0.01" required placeholder="10.00" />
      </Field>

      <Field label="When exceeded" htmlFor="action">
        <select
          id="action"
          name="action"
          className={selectClass}
          value={budgetAction}
          onChange={(e) => setBudgetAction(e.target.value)}
        >
          <option value="pause">Pause (block requests)</option>
          <option value="throttle" disabled={!allowThrottle}>
            Throttle{allowThrottle ? "" : " (Pro)"}
          </option>
          <option value="alert">Alert only</option>
        </select>
      </Field>

      {budgetAction === "throttle" && (
        <Field label="Requests per minute" htmlFor="throttleRpm">
          <Input id="throttleRpm" name="throttleRpm" type="number" min="1" max="600" defaultValue="5" />
        </Field>
      )}

      <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add budget"}
        </Button>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state.ok && <p className="text-sm text-muted-foreground">Budget saved. It applies to the next request.</p>}
      </div>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
