import Link from "next/link";
import { PLANS } from "@/lib/plans";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString("en-US") : "Unlimited");

/** Built from PLANS so the marketing page can never drift from what the app enforces. */
const TIERS = [
  {
    name: "Free",
    price: "$0",
    blurb: "For trying it on one project.",
    cta: "Start free",
    highlight: false,
    features: [
      `${fmt(PLANS.free.requestsPerMonth)} tracked requests / month`,
      `${PLANS.free.members} member`,
      `${fmt(PLANS.free.budgets)} budgets`,
      "Pause and alert actions",
      "Email alerts",
      `${PLANS.free.retentionDays}-day request history`,
    ],
  },
  {
    name: "Pro",
    price: "$29",
    blurb: "For teams running agents every day.",
    cta: "Start free, upgrade anytime",
    highlight: true,
    features: [
      `${fmt(PLANS.pro.requestsPerMonth)} tracked requests / month`,
      `Up to ${PLANS.pro.members} members`,
      `${fmt(PLANS.pro.budgets)} budgets`,
      "Pause, throttle and alert actions",
      "Email and Slack alerts",
      "Per-customer budgets",
      `${PLANS.pro.retentionDays}-day request history`,
    ],
  },
];

export function PricingTable() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {TIERS.map((t) => (
        <div
          key={t.name}
          className={cn("flex flex-col rounded-xl border p-6", t.highlight && "border-brand ring-1 ring-brand")}
        >
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-semibold">{t.name}</h3>
            {t.highlight && <span className="text-xs font-medium text-brand">Most popular</span>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t.blurb}</p>
          <p className="mt-4">
            <span className="text-4xl font-semibold tracking-tight">{t.price}</span>
            <span className="text-muted-foreground"> / month</span>
          </p>
          <ul className="mt-6 flex-1 space-y-2 text-sm">
            {t.features.map((f) => (
              <li key={f} className="flex gap-2">
                <span aria-hidden className="text-brand">
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: t.highlight ? "default" : "outline", size: "lg" }), "mt-6 w-full")}
          >
            {t.cta}
          </Link>
        </div>
      ))}
    </div>
  );
}

export const PRICING_NOTE =
  "Your LLM traffic is never blocked by BurnCap's own plan limits. Past your monthly quota, requests still pass through and budgets keep enforcing; the dashboard just stops recording new usage until the month resets.";
