"use server";

import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { isDemo } from "@/lib/demo";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function startCheckout(workspaceId: string) {
  const { user, workspace } = await requireOwner(workspaceId);
  if (workspace.plan === "pro") redirect(`/w/${workspaceId}/settings`);

  if (isDemo()) {
    // Simulate a completed checkout + webhook
    await supabaseAdmin().from("workspaces").update({ plan: "pro", stripe_customer_id: "cus_demo" }).eq("id", workspaceId);
    redirect(`/w/${workspaceId}/settings?billing=success`);
  }

  let customerId = workspace.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe().customers.create({
      email: user.email,
      metadata: { workspace_id: workspaceId },
    });
    customerId = customer.id;
    await supabaseAdmin().from("workspaces").update({ stripe_customer_id: customerId }).eq("id", workspaceId);
  }

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: workspaceId,
    line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
    subscription_data: { metadata: { workspace_id: workspaceId } },
    allow_promotion_codes: true,
    success_url: `${appUrl()}/w/${workspaceId}/settings?billing=success`,
    cancel_url: `${appUrl()}/w/${workspaceId}/settings`,
  });
  redirect(session.url!);
}

export async function openBillingPortal(workspaceId: string) {
  const { workspace } = await requireOwner(workspaceId);
  if (!workspace.stripe_customer_id) redirect(`/w/${workspaceId}/settings`);

  if (isDemo()) {
    // The real portal is where customers cancel; simulate that so the Free plan can be previewed again
    await supabaseAdmin().from("workspaces").update({ plan: "free" }).eq("id", workspaceId);
    redirect(`/w/${workspaceId}/settings`);
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: workspace.stripe_customer_id,
    return_url: `${appUrl()}/w/${workspaceId}/settings`,
  });
  redirect(session.url);
}
