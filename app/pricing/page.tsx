import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { PRICING_NOTE, PricingTable } from "@/components/marketing/pricing-table";

export const metadata: Metadata = { title: "Pricing | BurnCap" };

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-16">
        <h1 className="text-center text-3xl font-semibold tracking-tight">Pricing</h1>
        <p className="mx-auto mt-2 max-w-xl text-center text-muted-foreground">
          Start free. Upgrade when your team runs agents every day. Cancel anytime from the billing portal.
        </p>
        <div className="mt-10">
          <PricingTable />
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-muted-foreground">{PRICING_NOTE}</p>
      </main>
      <SiteFooter />
    </div>
  );
}
