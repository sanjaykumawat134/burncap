import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { PRICING_NOTE, PricingTable } from "@/components/marketing/pricing-table";

const STEPS = [
  {
    title: "Point your agent at BurnCap",
    body: "Change one base URL and add a header. Works with the OpenAI and Anthropic SDKs, LangChain, CrewAI, AutoGen and Claude Code.",
  },
  {
    title: "Tag who's spending",
    body: "Send x-bc-agent, and optionally x-bc-run and x-bc-customer. Every call is priced and attributed in real time.",
  },
  {
    title: "Set a hard limit",
    body: "Daily or monthly, per workspace, agent or customer. Over the limit, the agent gets a 402 instead of a bigger bill.",
  },
];

const FEATURES = [
  { title: "Hard budgets", body: "Requests are blocked before they reach the provider, not reported after the money is gone." },
  { title: "Throttle instead of stop", body: "Let a critical agent keep going at a few requests per minute once it's over budget." },
  { title: "Alerts at 50 / 80 / 100%", body: "Email and Slack, sent once per threshold, so you hear about it before the agent stops." },
  { title: "Per-run cost", body: "See which task burned $30 overnight, with request counts, tokens and duration." },
  { title: "Your keys stay yours", body: "Your OpenAI/Anthropic key passes straight through. BurnCap never stores it." },
  { title: "Fails open", body: "If BurnCap's budget store is unreachable, requests go through. We never take your agents down." },
];

const FAQ = [
  {
    q: "How much latency does it add?",
    a: "One or two Redis lookups before forwarding, usually a few milliseconds. Responses stream straight back, and cost is metered after the response is sent.",
  },
  {
    q: "Can a budget be overshot?",
    a: "Slightly. Cost is only known once a response finishes, so requests already in flight when the limit is hit will complete. Everything after that is blocked.",
  },
  {
    q: "What if I can't change the base URL?",
    a: "Report usage yourself with POST /api/v1/events. You still get the dashboard, alerts and the agent's budget status in the response.",
  },
  {
    q: "Does it work with Cursor?",
    a: "Only partly. Most Cursor traffic goes through Cursor's own servers, so only its custom OpenAI base-URL mode can be routed through BurnCap.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div className="space-y-6">
            <p className="text-sm font-medium text-brand">For coding agents and multi-agent systems</p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Put your AI agents on a budget.</h1>
            <p className="text-lg text-muted-foreground text-pretty">
              BurnCap tracks LLM spend per agent, run and customer, and automatically pauses or throttles any agent that hits
              its daily or monthly limit. No more surprise bills from a loop that ran all night.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/login" className={buttonVariants({ size: "lg" })}>
                Start free
              </Link>
              <Link href="/docs" className={buttonVariants({ size: "lg", variant: "outline" })}>
                Read the 2-minute setup
              </Link>
            </div>
          </div>

          <div className="space-y-3 overflow-hidden rounded-xl border bg-muted/30 p-4 font-mono text-xs leading-relaxed">
            <p className="text-muted-foreground"># Claude Code, or any Anthropic SDK client</p>
            <pre className="whitespace-pre-wrap break-all">{`export ANTHROPIC_BASE_URL=https://burncap.dev/api/v1/anthropic
export ANTHROPIC_CUSTOM_HEADERS="x-bc-key: bc_live_…
x-bc-agent: claude-code"`}</pre>
            <p className="pt-2 text-muted-foreground"># …once claude-code passes its $15/day limit</p>
            <pre className="whitespace-pre-wrap break-words rounded-md border bg-background p-3">
              <span className="text-brand">HTTP 402</span>
              {`
{
  "error": {
    "type": "budget_exceeded",
    "message": "BurnCap daily budget exceeded for agent ($15.02 of $15.00)"
  }
}`}
            </pre>
          </div>
        </section>

        <section className="border-y bg-muted/20">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="space-y-2">
                  <span className="grid size-7 place-items-center rounded-full bg-brand text-sm font-medium text-white">{i + 1}</span>
                  <h3 className="font-medium">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Built to stop spend, not just chart it</h2>
          <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="space-y-1.5">
                <h3 className="font-medium">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="border-t bg-muted/20">
          <div className="mx-auto max-w-4xl px-4 py-16">
            <h2 className="text-center text-2xl font-semibold tracking-tight">Simple pricing</h2>
            <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground">
              Priced on tracked requests, never on a percentage of your LLM bill.
            </p>
            <div className="mt-8">
              <PricingTable />
            </div>
            <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-muted-foreground">{PRICING_NOTE}</p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
          <dl className="mt-6 divide-y">
            {FAQ.map((f) => (
              <div key={f.q} className="py-4">
                <dt className="font-medium">{f.q}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
