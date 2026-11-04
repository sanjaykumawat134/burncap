import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { isDemo } from "@/lib/demo";
import { demoRedis } from "@/lib/demo/redis";

let client: Redis | null = null;

/** Lazily created so builds don't need Redis env vars. */
export function redis(): Redis {
  if (isDemo()) return demoRedis();
  client ??= new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  return client;
}

const limiters = new Map<number, Ratelimit>();

/** One sliding-window limiter per requests-per-minute value. */
export function ratelimitFor(rpm: number): Ratelimit {
  let rl = limiters.get(rpm);
  if (!rl) {
    rl = new Ratelimit({ redis: redis(), limiter: Ratelimit.slidingWindow(rpm, "60 s"), prefix: `rl:${rpm}` });
    limiters.set(rpm, rl);
  }
  return rl;
}

export const keys = {
  apiKey: (hash: string) => `apikey:${hash}`,
  budgets: (ws: string) => `budgets:${ws}`,
  paused: (ws: string, agent: string) => `paused:${ws}:${agent}`,
  spend: (ws: string, scope: string, id: string, periodKey: string) => `spend:${ws}:${scope}:${id}:${periodKey}`,
  requests: (ws: string, periodKey: string) => `reqs:${ws}:${periodKey}`,
};
