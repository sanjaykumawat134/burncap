import { describe, expect, it } from "vitest";
import { extractUsageFromJson, extractUsageFromSse } from "./usage";
import { costMicros, findPrice } from "./pricing";
import type { ModelPrice } from "@/types/domain";

const sse = (...events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");

describe("extractUsageFromJson", () => {
  it("reads Anthropic usage including cache tokens", () => {
    expect(
      extractUsageFromJson("anthropic", {
        model: "claude-sonnet-4-5",
        usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200 },
      }),
    ).toEqual({ model: "claude-sonnet-4-5", inputTokens: 100, outputTokens: 50, cachedInputTokens: 1000, cacheWriteTokens: 200 });
  });

  it("subtracts cached tokens from OpenAI prompt tokens", () => {
    expect(
      extractUsageFromJson("openai", {
        model: "gpt-4o",
        usage: { prompt_tokens: 1200, completion_tokens: 80, prompt_tokens_details: { cached_tokens: 1000 } },
      }),
    ).toMatchObject({ inputTokens: 200, cachedInputTokens: 1000, outputTokens: 80 });
  });

  it("reads OpenAI Responses API usage", () => {
    expect(
      extractUsageFromJson("openai", { model: "gpt-4.1", usage: { input_tokens: 10, output_tokens: 5 } }),
    ).toMatchObject({ inputTokens: 10, outputTokens: 5 });
  });

  it("returns null without usage", () => {
    expect(extractUsageFromJson("openai", { model: "x" })).toBeNull();
  });
});

describe("extractUsageFromSse", () => {
  it("combines Anthropic message_start and final message_delta", () => {
    const raw =
      "event: message_start\n" +
      sse({ type: "message_start", message: { model: "claude-haiku-4-5", usage: { input_tokens: 40, output_tokens: 1 } } }) +
      sse({ type: "content_block_delta", delta: { text: "hi" } }) +
      sse({ type: "message_delta", usage: { output_tokens: 12 } }) +
      sse({ type: "message_stop" });
    expect(extractUsageFromSse("anthropic", raw)).toMatchObject({ model: "claude-haiku-4-5", inputTokens: 40, outputTokens: 12 });
  });

  it("reads the final OpenAI chunk with include_usage", () => {
    const raw =
      sse({ model: "gpt-4o-mini", choices: [{ delta: { content: "hi" } }], usage: null }) +
      sse({ model: "gpt-4o-mini", choices: [], usage: { prompt_tokens: 7, completion_tokens: 3 } }) +
      "data: [DONE]\n\n";
    expect(extractUsageFromSse("openai", raw)).toMatchObject({ inputTokens: 7, outputTokens: 3 });
  });

  it("reads OpenAI Responses API response.completed", () => {
    const raw = sse({ type: "response.completed", response: { model: "gpt-4.1", usage: { input_tokens: 9, output_tokens: 4 } } });
    expect(extractUsageFromSse("openai", raw)).toMatchObject({ model: "gpt-4.1", inputTokens: 9, outputTokens: 4 });
  });
});

describe("pricing", () => {
  const prices: ModelPrice[] = [
    { provider: "anthropic", model: "claude-sonnet", inputPerMtokMicros: 1, outputPerMtokMicros: 1, cachedInputPerMtokMicros: null, cacheWritePerMtokMicros: null },
    { provider: "anthropic", model: "claude-sonnet-4-5", inputPerMtokMicros: 3_000_000, outputPerMtokMicros: 15_000_000, cachedInputPerMtokMicros: 300_000, cacheWritePerMtokMicros: 3_750_000 },
  ];

  it("picks the longest matching prefix", () => {
    expect(findPrice(prices, "anthropic", "claude-sonnet-4-5-20250929")?.model).toBe("claude-sonnet-4-5");
    expect(findPrice(prices, "openai", "claude-sonnet-4-5")).toBeNull();
  });

  it("computes micro-dollar cost", () => {
    // 1M input @ $3 + 100k output @ $15 + 1M cached @ $0.30 = $3 + $1.5 + $0.30
    const usage = { model: "m", inputTokens: 1_000_000, outputTokens: 100_000, cachedInputTokens: 1_000_000, cacheWriteTokens: 0 };
    expect(costMicros(usage, prices[1])).toBe(4_800_000);
  });
});
