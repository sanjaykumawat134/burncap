import "server-only";
import type { Redis } from "@upstash/redis";
import { demoStore } from "./store";

/** Map-backed stand-in for the handful of Upstash commands the app uses. TTLs are ignored. */
export function demoRedis(): Redis {
  const m = demoStore().redis;
  const num = (k: string) => Number(m.get(k) ?? 0);
  const commands = {
    get: async (k: string) => m.get(k) ?? null,
    set: async (k: string, v: unknown) => (m.set(k, v), "OK"),
    del: async (...ks: string[]) => ks.filter((k) => m.delete(k)).length,
    exists: async (...ks: string[]) => ks.filter((k) => m.has(k)).length,
    mget: async (...ks: string[]) => ks.map((k) => m.get(k) ?? null),
    incr: async (k: string) => (m.set(k, num(k) + 1), num(k)),
    incrby: async (k: string, by: number) => (m.set(k, num(k) + by), num(k)),
    expire: async () => 1,
  };
  return {
    ...commands,
    pipeline: () => {
      const ops: (() => Promise<unknown>)[] = [];
      const p = {
        incr: (k: string) => (ops.push(() => commands.incr(k)), p),
        incrby: (k: string, by: number) => (ops.push(() => commands.incrby(k, by)), p),
        expire: () => (ops.push(() => commands.expire()), p),
        exec: async () => {
          const out = [];
          for (const op of ops) out.push(await op());
          return out;
        },
      };
      return p;
    },
  } as unknown as Redis;
}
