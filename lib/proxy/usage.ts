import type { Provider, Usage } from "@/types/domain";

/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are untyped JSON */

/** Reads token usage from a non-streaming provider response body. */
export function extractUsageFromJson(provider: Provider, body: any): Usage | null {
  const u = body?.usage;
  if (!u || !body.model) return null;

  if (provider === "anthropic") {
    return {
      model: body.model,
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cachedInputTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    };
  }

  // OpenAI: Chat Completions uses prompt/completion_tokens, Responses API uses input/output_tokens.
  // Cached tokens are included in the prompt count, so subtract them to bill them separately.
  const input = u.prompt_tokens ?? u.input_tokens ?? 0;
  const cached = u.prompt_tokens_details?.cached_tokens ?? u.input_tokens_details?.cached_tokens ?? 0;
  return {
    model: body.model,
    inputTokens: Math.max(0, input - cached),
    outputTokens: u.completion_tokens ?? u.output_tokens ?? 0,
    cachedInputTokens: cached,
    cacheWriteTokens: 0,
  };
}

/** Reads token usage from a complete SSE stream body. */
export function extractUsageFromSse(provider: Provider, raw: string): Usage | null {
  const events: any[] = [];
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      events.push(JSON.parse(data));
    } catch {
      // ignore partial or non-JSON lines
    }
  }

  if (provider === "anthropic") {
    // message_start carries input usage; the last message_delta carries cumulative output tokens
    const start = events.find((e) => e.type === "message_start")?.message;
    if (!start) return null;
    const delta = events.findLast((e) => e.type === "message_delta");
    return extractUsageFromJson("anthropic", {
      model: start.model,
      usage: { ...start.usage, ...delta?.usage },
    });
  }

  // Chat Completions: final chunk has `usage` (requires stream_options.include_usage).
  // Responses API: `response.completed` event carries `response.usage`.
  const last = events.findLast((e) => e?.usage || e?.response?.usage);
  return last ? extractUsageFromJson("openai", last.response ?? last) : null;
}
