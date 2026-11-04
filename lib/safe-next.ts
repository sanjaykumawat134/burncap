/** Only allow same-origin relative paths as post-login redirect targets (blocks //evil.com and /\evil.com). */
export function safeNext(next: unknown, fallback = "/app"): string {
  return typeof next === "string" && /^\/(?![/\\])/.test(next) ? next : fallback;
}
