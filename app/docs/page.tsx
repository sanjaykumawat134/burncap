import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";

export const metadata: Metadata = { title: "Docs | BurnCap" };

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://burncap.dev";

const SECTIONS = [
  { id: "quickstart", title: "Quickstart" },
  { id: "headers", title: "Attribution headers" },
  { id: "limits", title: "Handling budget limits" },
  { id: "sdk", title: "SDKs (Python, TypeScript)" },
  { id: "events", title: "Reporting usage manually" },
  { id: "status", title: "Checking agent status" },
  { id: "behaviour", title: "Good to know" },
];

function Code({ title, children }: { title?: string; children: string }) {
  return (
    <div className="space-y-1.5">
      {title && <p className="text-sm font-medium">{title}</p>}
      <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">{children}</pre>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4 border-t pt-8 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

const ic = "rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]";

export default function DocsPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[200px_1fr]">
        <nav className="hidden md:block">
          <ul className="sticky top-6 space-y-2 text-sm">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 space-y-10 text-sm leading-relaxed">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Docs</h1>
            <p className="text-muted-foreground">
              BurnCap is an HTTP proxy in front of OpenAI and Anthropic. Change the base URL, add your BurnCap key, and every
              call is priced, attributed and checked against your budgets.
            </p>
          </div>

          <Section id="quickstart" title="Quickstart">
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                <Link href="/login" className="underline underline-offset-4">Sign in</Link> and create an API key under{" "}
                <strong>API keys</strong>.
              </li>
              <li>Point your client at BurnCap and send the key in <code className={ic}>x-bc-key</code>.</li>
              <li>Add a budget under <strong>Budgets</strong>.</li>
            </ol>
            <p>Keep sending your own provider key as usual. It passes through untouched and is never stored.</p>
            <Code title="Claude Code">{`export ANTHROPIC_BASE_URL=${BASE}/api/v1/anthropic
export ANTHROPIC_CUSTOM_HEADERS="x-bc-key: bc_live_…
x-bc-agent: claude-code"`}</Code>
            <Code title="Python: OpenAI SDK (LangChain, CrewAI and AutoGen accept the same base_url / headers)">{`from openai import OpenAI

client = OpenAI(
    base_url="${BASE}/api/v1/openai/v1",
    default_headers={"x-bc-key": "bc_live_…", "x-bc-agent": "researcher"},
)`}</Code>
            <Code title="TypeScript: Anthropic SDK">{`import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  baseURL: "${BASE}/api/v1/anthropic",
  defaultHeaders: { "x-bc-key": "bc_live_…", "x-bc-agent": "support-bot" },
});`}</Code>
            <p>
              Any path after <code className={ic}>/api/v1/openai</code> or <code className={ic}>/api/v1/anthropic</code> is
              forwarded to the provider, streaming included.
            </p>
          </Section>

          <Section id="headers" title="Attribution headers">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-4 font-medium">Header</th>
                    <th className="py-2 pr-4 font-medium">Required</th>
                    <th className="py-2 font-medium">Purpose</th>
                  </tr>
                </thead>
                <tbody className="[&_td]:py-2 [&_td]:pr-4 [&_tr]:border-b">
                  <tr><td><code className={ic}>x-bc-key</code></td><td>Yes</td><td>Your BurnCap key. Removed before forwarding.</td></tr>
                  <tr><td><code className={ic}>x-bc-agent</code></td><td>No</td><td>Agent id. Defaults to <code className={ic}>default</code>. New ids appear on the dashboard automatically.</td></tr>
                  <tr><td><code className={ic}>x-bc-run</code></td><td>No</td><td>Groups calls into one task, shown on the Runs page.</td></tr>
                  <tr><td><code className={ic}>x-bc-customer</code></td><td>No</td><td>Your end customer, for per-customer budgets (Pro).</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground">
              Ids may contain letters, digits and <code className={ic}>_ . : @ -</code>, up to 128 characters. Invalid values are ignored.
            </p>
          </Section>

          <Section id="limits" title="Handling budget limits">
            <p>When a budget is exceeded, the proxy answers instead of the provider, in an error shape both SDKs can parse:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Pause</strong>: <code className={ic}>402</code> with type <code className={ic}>budget_exceeded</code>. The agent should stop.</li>
              <li><strong>Throttle</strong>: <code className={ic}>429</code> with type <code className={ic}>budget_throttled</code> and <code className={ic}>retry-after: 60</code>.</li>
              <li>An agent paused by hand on the dashboard also gets <code className={ic}>402</code>.</li>
            </ul>
            <Code>{`{ "type": "error", "error": { "type": "budget_exceeded", "code": "budget_exceeded",
  "message": "BurnCap daily budget exceeded for agent ($15.02 of $15.00)" } }`}</Code>
            <p className="text-muted-foreground">
              SDKs retry 429s automatically, so a throttled agent slows down without extra code. Treat 402 as final:
              most SDKs don&apos;t retry it.
            </p>
          </Section>

          <Section id="sdk" title="SDKs (Python, TypeScript)">
            <p>
              Both SDKs are optional and dependency-free. They build the base URLs and headers, tell BurnCap budget errors
              apart from the provider&apos;s own errors, and wrap the endpoints below. Neither is on PyPI or npm yet.
            </p>
            <Code title="Python: install from GitHub">{`pip install "git+https://github.com/sanjaykumawat134/burncap#subdirectory=sdk/python"`}</Code>
            <Code>{`from openai import OpenAI
from burncap import BurnCap, is_budget_error, new_run_id

bc = BurnCap(key=os.environ["BURNCAP_KEY"], base_url="${BASE}")
client = OpenAI(
    base_url=bc.openai_base_url,
    default_headers=bc.headers(agent="researcher", run=new_run_id("research")),
)

try:
    client.chat.completions.create(model="gpt-4.1", messages=messages)
except Exception as err:
    if is_budget_error(err):
        stop_agent("Out of budget")
    else:
        raise`}</Code>
            <p>
              <strong>TypeScript:</strong> copy <code className={ic}>sdk/js/src/index.ts</code> from the repo into your project
              (it&apos;s one file) and import from it.
            </p>
            <Code>{`import OpenAI from "openai";
import { BurnCap, isBudgetError, newRunId } from "./burncap";

const bc = new BurnCap({ key: process.env.BURNCAP_KEY!, baseUrl: "${BASE}" });
const openai = new OpenAI({
  baseURL: bc.openaiBaseURL,
  defaultHeaders: bc.headers({ agent: "researcher", run: newRunId("research") }),
});

try {
  await openai.chat.completions.create({ model: "gpt-4.1", messages });
} catch (err) {
  if (isBudgetError(err)) return stopAgent("Out of budget");
  throw err;
}`}</Code>
          </Section>

          <Section id="events" title="Reporting usage manually">
            <p>
              If a call can&apos;t go through the proxy (another gateway, a batch job), report it with{" "}
              <code className={ic}>POST /api/v1/events</code>. Send one event or up to 100 as <code className={ic}>{"{ events: [...] }"}</code>.
              Without <code className={ic}>cost_usd</code>, BurnCap prices the tokens from its model price table.
            </p>
            <Code>{`curl ${BASE}/api/v1/events \\
  -H "x-bc-key: bc_live_…" -H "content-type: application/json" \\
  -d '{"agent_id":"batch-summarizer","run_id":"nightly-2026-11-04",
       "provider":"anthropic","model":"claude-haiku-4-5",
       "input_tokens":120000,"output_tokens":8000}'

{ "recorded": 1, "agents": { "batch-summarizer": "active" } }`}</Code>
            <p className="text-muted-foreground">
              Each agent&apos;s status (<code className={ic}>active</code>, <code className={ic}>throttled</code> or{" "}
              <code className={ic}>paused</code>) comes back in the response, so a batch job can stop itself.
            </p>
          </Section>

          <Section id="status" title="Checking agent status">
            <Code>{`curl ${BASE}/api/v1/agents/claude-code/status -H "x-bc-key: bc_live_…"

{ "agent_id": "claude-code", "status": "active", "reason": null,
  "spent_today_usd": 6.42, "spent_month_usd": 16.41 }`}</Code>
            <p className="text-muted-foreground">
              Useful before starting a long task, so it doesn&apos;t get cut off halfway. <code className={ic}>status</code> is{" "}
              <code className={ic}>active</code>, <code className={ic}>throttled</code> or <code className={ic}>paused</code>;{" "}
              <code className={ic}>reason</code> names the budget responsible (e.g. <code className={ic}>agent_monthly_budget</code>) or{" "}
              <code className={ic}>paused_manually</code>. Add <code className={ic}>?customer=…</code> to include that customer&apos;s budgets.
            </p>
          </Section>

          <Section id="behaviour" title="Good to know">
            <ul className="list-disc space-y-2 pl-5">
              <li>Periods are UTC. Daily budgets reset at 00:00 UTC, monthly ones on the 1st.</li>
              <li>
                Cost is known only once a response finishes, so requests already in flight when a limit is reached will
                complete. The overshoot is bounded by those requests.
              </li>
              <li>If BurnCap&apos;s budget store is unreachable, requests are allowed through (fail-open).</li>
              <li>Alerts are sent once per budget, period and threshold (50%, 80%, 100%).</li>
              <li>
                Over your plan&apos;s monthly request quota, traffic still flows and budgets still enforce; new usage just
                stops being recorded on the dashboard until the month resets.
              </li>
            </ul>
          </Section>
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
