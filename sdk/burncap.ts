/**
 * BurnCap client helper. Zero dependencies; works in Node 18+, Bun, Deno and edge runtimes.
 *
 *   const bc = new BurnCap({ key: process.env.BURNCAP_KEY!, baseUrl: "https://burncap.dev" });
 *   const openai = new OpenAI({ baseURL: bc.openaiBaseURL, defaultHeaders: bc.headers({ agent: "researcher" }) });
 *   const anthropic = new Anthropic({ baseURL: bc.anthropicBaseURL, defaultHeaders: bc.headers({ agent: "support-bot", run: runId }) });
 */

export interface Attribution {
  /** Agent id, e.g. "code-reviewer". Defaults to "default". */
  agent?: string;
  /** Groups calls into one task/run. */
  run?: string;
  /** Attributes spend to your end customer (Pro plan). */
  customer?: string;
}

export interface UsageEvent {
  agent_id?: string;
  run_id?: string;
  customer_id?: string;
  provider: "openai" | "anthropic";
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  cached_input_tokens?: number;
  cache_write_tokens?: number;
  /** If set, used instead of BurnCap's price table. */
  cost_usd?: number;
  latency_ms?: number;
}

export type AgentStatus = "active" | "throttled" | "paused";

export class BurnCapError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly type: string,
  ) {
    super(message);
    this.name = "BurnCapError";
  }
}

export class BurnCap {
  readonly baseUrl: string;
  private readonly key: string;

  constructor(opts: { key: string; baseUrl?: string }) {
    if (!opts.key?.startsWith("bc_")) throw new Error("BurnCap: key must start with bc_");
    this.key = opts.key;
    this.baseUrl = (opts.baseUrl ?? "https://burncap.dev").replace(/\/+$/, "");
  }

  /** Pass as `baseURL` to the OpenAI SDK (and LangChain, CrewAI, LiteLLM…). */
  get openaiBaseURL() {
    return `${this.baseUrl}/api/v1/openai/v1`;
  }

  /** Pass as `baseURL` to the Anthropic SDK. */
  get anthropicBaseURL() {
    return `${this.baseUrl}/api/v1/anthropic`;
  }

  /** Headers for the provider SDK's `defaultHeaders` (or per-request headers). */
  headers(a: Attribution = {}): Record<string, string> {
    const h: Record<string, string> = { "x-bc-key": this.key };
    if (a.agent) h["x-bc-agent"] = a.agent;
    if (a.run) h["x-bc-run"] = a.run;
    if (a.customer) h["x-bc-customer"] = a.customer;
    return h;
  }

  /** Records usage for calls that didn't go through the proxy. Returns each agent's budget status. */
  async track(events: UsageEvent | UsageEvent[]): Promise<{ recorded: number; agents: Record<string, AgentStatus> }> {
    return this.request("/api/v1/events", { method: "POST", body: JSON.stringify({ events: [events].flat() }) });
  }

  /** Checks whether an agent may run, e.g. before starting a long task. */
  async status(
    agent: string,
    opts: { customer?: string } = {},
  ): Promise<{ agent_id: string; status: AgentStatus; reason: string | null; spent_today_usd: number; spent_month_usd: number }> {
    const q = opts.customer ? `?customer=${encodeURIComponent(opts.customer)}` : "";
    return this.request(`/api/v1/agents/${encodeURIComponent(agent)}/status${q}`, { method: "GET" });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      ...init,
      headers: { "content-type": "application/json", "x-bc-key": this.key },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new BurnCapError(body?.error?.message ?? `HTTP ${res.status}`, res.status, body?.error?.type ?? "http_error");
    return body as T;
  }
}

/**
 * True when a provider SDK error came from a BurnCap budget limit rather than the provider.
 * Works with OpenAI and Anthropic SDK errors (both expose `status` and the parsed error body).
 */
export function isBudgetError(err: unknown): err is { status: 402 | 429 } {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { status?: number; type?: string; error?: { type?: string; error?: { type?: string } } };
  const type = e.type ?? e.error?.error?.type ?? e.error?.type;
  return (e.status === 402 || e.status === 429) && (type === "budget_exceeded" || type === "budget_throttled");
}

/** A short random run id, e.g. "run_k3j9x2ab". */
export const newRunId = (prefix = "run") => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
