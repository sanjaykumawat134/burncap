import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

/** Lazily created so builds don't need Stripe env vars. Uses the SDK's pinned API version. */
export function stripe(): Stripe {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

/** Subscription statuses that keep Pro features on. past_due keeps access while Stripe retries the card. */
export const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);
