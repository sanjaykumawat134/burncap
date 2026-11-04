import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const SOURCE = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

interface LiteLLMEntry {
  litellm_provider?: string;
  mode?: string;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost?: number;
}

// USD per token → micro-USD per 1M tokens
const toMicrosPerMtok = (perToken: number) => Math.round(perToken * 1e12);

/** Nightly: pull OpenAI + Anthropic chat model prices from LiteLLM's public price list. */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const res = await fetch(SOURCE, { cache: "no-store" });
  if (!res.ok) return Response.json({ error: `source returned ${res.status}` }, { status: 502 });
  const all = (await res.json()) as Record<string, LiteLLMEntry>;

  const rows = Object.entries(all)
    .filter(
      ([model, e]) =>
        (e.litellm_provider === "openai" || e.litellm_provider === "anthropic") &&
        (e.mode === "chat" || e.mode === "responses") &&
        e.input_cost_per_token !== undefined &&
        e.output_cost_per_token !== undefined &&
        !model.includes("/"),
    )
    .map(([model, e]) => ({
      provider: e.litellm_provider,
      model,
      input_per_mtok_micros: toMicrosPerMtok(e.input_cost_per_token!),
      output_per_mtok_micros: toMicrosPerMtok(e.output_cost_per_token!),
      cached_input_per_mtok_micros:
        e.cache_read_input_token_cost === undefined ? null : toMicrosPerMtok(e.cache_read_input_token_cost),
      cache_write_per_mtok_micros:
        e.cache_creation_input_token_cost === undefined ? null : toMicrosPerMtok(e.cache_creation_input_token_cost),
      updated_at: new Date().toISOString(),
    }));

  const { error } = await supabaseAdmin().from("model_prices").upsert(rows, { onConflict: "provider,model" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ synced: rows.length });
}
