# burncap (TypeScript / JavaScript)

Hard budgets for AI agents. Route OpenAI and Anthropic calls through [BurnCap](https://github.com/sanjaykumawat134/burncap) to track spend per agent, run and customer, and have agents paused or throttled automatically when they hit a budget.

Zero dependencies. Node 18+, Bun, Deno and edge runtimes. ESM and CommonJS.

## Install

Not on npm yet. Until it is, copy [`src/index.ts`](src/index.ts) into your project (it's one file).

## Use

```ts
import OpenAI from "openai";
import { BurnCap, isBudgetError, newRunId } from "burncap";

const bc = new BurnCap({ key: process.env.BURNCAP_KEY!, baseUrl: "https://your-burncap-host" });

const openai = new OpenAI({
  baseURL: bc.openaiBaseURL,
  defaultHeaders: bc.headers({ agent: "researcher", run: newRunId("research") }),
});

try {
  await openai.chat.completions.create({ model: "gpt-4.1", messages });
} catch (err) {
  if (isBudgetError(err)) return stopAgent("out of budget");
  throw err;
}
```

Anthropic: `new Anthropic({ baseURL: bc.anthropicBaseURL, defaultHeaders: bc.headers({ agent: "support-bot" }) })`.

## API

| | |
|---|---|
| `new BurnCap({ key, baseUrl })` | Client. Rejects keys that don't start with `bc_`. |
| `.openaiBaseURL` / `.anthropicBaseURL` | Proxy URLs for the provider SDK's `baseURL`. |
| `.headers({ agent, run, customer })` | `x-bc-*` headers for `defaultHeaders`. |
| `.track(eventOrEvents)` | Report usage for calls that skip the proxy. Returns each agent's status. |
| `.status(agent, { customer })` | `active` / `throttled` / `paused`, with `reason` and spend. |
| `isBudgetError(err)` | True for a BurnCap 402/429 from the OpenAI or Anthropic SDK, false for the provider's own errors. |
| `newRunId(prefix)` | Short random run id. |

## Build

```bash
npm ci && npm run build   # → dist/esm and dist/cjs
```
