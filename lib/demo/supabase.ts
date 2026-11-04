import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO_USER } from "./index";
import { demoStore, type Row } from "./store";

/* eslint-disable @typescript-eslint/no-explicit-any -- mimics PostgREST's untyped results */

type Result = { data: any; error: null; count?: number | null };

const DEFAULTS: Record<string, () => Row> = {
  api_keys: () => ({ last_used_at: null, revoked_at: null }),
  agents: () => ({ status: "active", display_name: null, first_seen_at: new Date().toISOString() }),
  budgets: () => ({ enabled: true, throttle_rpm: 5, alert_thresholds: [50, 80, 100] }),
  alert_channels: () => ({ enabled: true }),
  workspace_invites: () => ({ accepted_at: null }),
};

/** Resolves "budgets.workspace_id" against embedded objects. */
const get = (row: Row, path: string) => path.split(".").reduce<any>((v, k) => v?.[k], row);

/**
 * A tiny in-memory stand-in for the PostgREST query builder: just the methods this app calls.
 * Embedded relations (e.g. `workspaces(name)`) are served from fields pre-populated in the fixtures.
 */
class Query implements PromiseLike<Result> {
  private filters: ((r: Row) => boolean)[] = [];
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: any;
  private returning = false;
  private single = false;
  private head = false;
  private wantCount = false;
  private sort?: { col: string; asc: boolean };
  private max?: number;
  private conflict?: { cols: string[]; ignore: boolean };
  private embeds: string[] = [];

  constructor(private table: string) {}

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op !== "select") this.returning = true;
    // "id, workspaces(plan)" → ["workspaces"]; resolved via the workspace_id foreign key
    this.embeds = [...(cols ?? "").matchAll(/(\w+)(?:!\w+)?\(/g)].map((m) => m[1]);
    this.wantCount = !!opts?.count;
    this.head = !!opts?.head;
    return this;
  }
  insert(v: Row | Row[]) {
    this.op = "insert";
    this.payload = v;
    return this;
  }
  update(v: Row) {
    this.op = "update";
    this.payload = v;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  upsert(v: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert";
    this.payload = v;
    this.conflict = { cols: (opts?.onConflict ?? "id").split(","), ignore: !!opts?.ignoreDuplicates };
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => get(r, col) === val);
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push((r) => get(r, col) !== val);
    return this;
  }
  is(col: string, val: null) {
    this.filters.push((r) => (get(r, col) ?? null) === val);
    return this;
  }
  gte(col: string, val: string | number) {
    this.filters.push((r) => get(r, col) >= val);
    return this;
  }
  lt(col: string, val: string | number) {
    this.filters.push((r) => get(r, col) < val);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.sort = { col, asc: opts?.ascending ?? true };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve()
      .then(() => this.run())
      .then(ok, fail);
  }

  private rows() {
    return (demoStore().tables[this.table] ??= []);
  }

  /** Attaches many-to-one relations (budgets → budget_id) that fixture rows don't already carry. */
  private embed(r: Row): Row {
    for (const rel of this.embeds) {
      if (r[rel] !== undefined) continue;
      const fk = `${rel.replace(/s$/, "")}_id`;
      r[rel] = demoStore().tables[rel]?.find((t) => t.id === r[fk]) ?? null;
    }
    return r;
  }

  private matches() {
    return this.rows()
      .map((r) => this.embed(r))
      .filter((r) => this.filters.every((f) => f(r)));
  }

  private withDefaults(r: Row): Row {
    return { id: randomUUID(), created_at: new Date().toISOString(), ...DEFAULTS[this.table]?.(), ...r };
  }

  private out(data: Row[]): Result {
    if (this.single) return { data: data[0] ?? null, error: null };
    return { data: this.op === "select" || this.returning ? data : null, error: null };
  }

  private run(): Result {
    const table = this.rows();
    switch (this.op) {
      case "select": {
        let data = this.matches();
        if (this.sort) {
          const { col, asc } = this.sort;
          data = [...data].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
        }
        const count = data.length;
        if (this.max !== undefined) data = data.slice(0, this.max);
        if (this.head) return { data: null, error: null, count };
        return { ...this.out(data), count: this.wantCount ? count : null };
      }
      case "insert": {
        const added = [this.payload].flat().map((r: Row) => this.withDefaults(r));
        table.push(...added);
        return this.out(added);
      }
      case "update": {
        const hit = this.matches();
        hit.forEach((r) => Object.assign(r, this.payload));
        return this.out(hit);
      }
      case "delete": {
        const hit = new Set(this.matches());
        demoStore().tables[this.table] = table.filter((r) => !hit.has(r));
        return this.out([...hit]);
      }
      case "upsert": {
        const { cols, ignore } = this.conflict!;
        const affected: Row[] = [];
        for (const r of [this.payload].flat() as Row[]) {
          const existing = table.find((t) => cols.every((c) => t[c] === r[c]));
          if (existing) {
            if (ignore) continue;
            Object.assign(existing, r);
            affected.push(existing);
          } else {
            const row = this.withDefaults(r);
            table.push(row);
            affected.push(row);
          }
        }
        return this.out(affected);
      }
    }
  }
}

function rpc(fn: string, args: Record<string, any>): Promise<Result> {
  const { tables, users } = demoStore();

  if (fn === "top_runs") {
    const runs = new Map<string, Row>();
    for (const e of tables.usage_events) {
      if (e.workspace_id !== args.p_ws || !e.run_id || e.created_at < args.p_since) continue;
      const r = runs.get(e.run_id) ?? {
        run_id: e.run_id, agentSet: new Set<string>(), requests: 0, input_tokens: 0, output_tokens: 0,
        cost_micros: 0, started_at: e.created_at, ended_at: e.created_at,
      };
      r.agentSet.add(e.agent_id);
      r.requests++;
      r.input_tokens += e.input_tokens + e.cached_input_tokens + e.cache_write_tokens;
      r.output_tokens += e.output_tokens;
      r.cost_micros += e.cost_micros;
      if (e.created_at < r.started_at) r.started_at = e.created_at;
      if (e.created_at > r.ended_at) r.ended_at = e.created_at;
      runs.set(e.run_id, r);
    }
    const data = [...runs.values()]
      .sort((a, b) => b.cost_micros - a.cost_micros)
      .slice(0, args.p_limit ?? 50)
      .map(({ agentSet, ...r }) => ({ ...r, agents: [...agentSet].join(", ") }));
    return Promise.resolve({ data, error: null });
  }

  if (fn === "workspace_members_with_email") {
    const data = tables.workspace_members
      .filter((m) => m.workspace_id === args.p_ws)
      .map((m) => ({ user_id: m.user_id, email: users.get(m.user_id) ?? "unknown", role: m.role, created_at: m.created_at }));
    return Promise.resolve({ data, error: null });
  }

  if (fn === "increment_usage_daily") {
    const key = { workspace_id: args.p_ws, day: args.p_day, agent_id: args.p_agent, customer_id: args.p_customer ?? "", model: args.p_model };
    let row = tables.usage_daily.find((r) => Object.entries(key).every(([k, v]) => r[k] === v));
    if (!row) tables.usage_daily.push((row = { ...key, requests: 0, input_tokens: 0, output_tokens: 0, cost_micros: 0 }));
    row.requests += 1;
    row.input_tokens += args.p_in;
    row.output_tokens += args.p_out;
    row.cost_micros += args.p_cost;
    return Promise.resolve({ data: null, error: null });
  }
  if (fn === "purge_usage_events") return Promise.resolve({ data: 0, error: null });
  throw new Error(`[demo] rpc ${fn} not mocked`);
}

const auth = {
  getUser: async () => ({ data: { user: { ...DEMO_USER } }, error: null }),
  signOut: async () => ({ error: null }),
  signInWithOtp: async () => ({ data: {}, error: null }),
  exchangeCodeForSession: async () => ({ data: {}, error: null }),
};

/** Same shape the app expects from a Supabase client, backed by the in-memory demo store. */
export function demoSupabase(): SupabaseClient {
  return { from: (t: string) => new Query(t), rpc, auth } as unknown as SupabaseClient;
}
