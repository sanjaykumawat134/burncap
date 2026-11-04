"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginForm({ next, linkError }: { next: string; linkError: boolean }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in to BurnCap</CardTitle>
        <CardDescription>We&apos;ll email you a magic link. No password needed.</CardDescription>
      </CardHeader>
      <CardContent>
        {state.ok ? (
          <p className="text-sm">Check your inbox for the sign-in link.</p>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            {(state.error || linkError) && (
              <p className="text-sm text-destructive">{state.error ?? "That sign-in link expired or was already used."}</p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Sending…" : "Send magic link"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
