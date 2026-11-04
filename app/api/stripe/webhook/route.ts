import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe, PRO_STATUSES } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Subscription state → workspaces.plan. Stripe is the source of truth; we only mirror it. */
async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const plan = PRO_STATUSES.has(sub.status) ? "pro" : "free";
  const update = { plan, stripe_customer_id: customerId, stripe_subscription_id: plan === "pro" ? sub.id : null };

  const db = supabaseAdmin();
  const workspaceId = sub.metadata?.workspace_id;
  const { error } = workspaceId
    ? await db.from("workspaces").update(update).eq("id", workspaceId)
    : await db.from("workspaces").update(update).eq("stripe_customer_id", customerId);
  if (error) throw error;
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (e) {
    return new Response(`Invalid signature: ${(e as Error).message}`, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && session.subscription) {
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        await syncSubscription(await stripe().subscriptions.retrieve(subId));
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object);
      break;
  }

  return Response.json({ received: true });
}
