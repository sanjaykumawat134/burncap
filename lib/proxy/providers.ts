import type { Provider } from "@/types/domain";

export const UPSTREAM: Record<Provider, string> = {
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
};

export const isProvider = (p: string): p is Provider => p in UPSTREAM;

const DROP_REQUEST = new Set(["host", "content-length", "connection", "accept-encoding", "cookie"]);
// fetch() already decoded the body, so encoding/length headers would be wrong
const DROP_RESPONSE = new Set(["content-encoding", "content-length", "transfer-encoding", "connection"]);

export function forwardRequestHeaders(h: Headers): Headers {
  const out = new Headers();
  h.forEach((v, k) => {
    if (DROP_REQUEST.has(k) || k.startsWith("x-bc-") || k.startsWith("x-vercel") || k.startsWith("x-forwarded")) return;
    out.set(k, v);
  });
  return out;
}

export function forwardResponseHeaders(h: Headers): Headers {
  const out = new Headers();
  h.forEach((v, k) => {
    if (!DROP_RESPONSE.has(k)) out.set(k, v);
  });
  return out;
}

/** Error body readable by both OpenAI and Anthropic SDKs. */
export function proxyError(status: number, type: string, message: string, headers: HeadersInit = {}) {
  return Response.json({ type: "error", error: { type, code: type, message } }, { status, headers });
}
