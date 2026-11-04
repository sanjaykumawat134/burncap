import type { Micros, ModelPrice, Provider, Usage } from "@/types/domain";

/** Longest-prefix match, so "claude-sonnet-4-5-20250929" matches a "claude-sonnet-4-5" row. */
export function findPrice(prices: ModelPrice[], provider: Provider, model: string): ModelPrice | null {
  let best: ModelPrice | null = null;
  for (const p of prices) {
    if (p.provider !== provider || !model.startsWith(p.model)) continue;
    if (!best || p.model.length > best.model.length) best = p;
  }
  return best;
}

export function costMicros(usage: Usage, price: ModelPrice): Micros {
  const perTok = (tokens: number, perMtok: number) => (tokens * perMtok) / 1_000_000;
  return Math.ceil(
    perTok(usage.inputTokens, price.inputPerMtokMicros) +
      perTok(usage.outputTokens, price.outputPerMtokMicros) +
      perTok(usage.cachedInputTokens, price.cachedInputPerMtokMicros ?? price.inputPerMtokMicros) +
      perTok(usage.cacheWriteTokens, price.cacheWritePerMtokMicros ?? price.inputPerMtokMicros),
  );
}
