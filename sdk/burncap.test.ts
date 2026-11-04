import { describe, expect, it } from "vitest";
import { BurnCap, isBudgetError, newRunId } from "./burncap";

describe("BurnCap SDK", () => {
  const bc = new BurnCap({ key: "bc_live_test", baseUrl: "https://example.com/" });

  it("builds provider base URLs without double slashes", () => {
    expect(bc.openaiBaseURL).toBe("https://example.com/api/v1/openai/v1");
    expect(bc.anthropicBaseURL).toBe("https://example.com/api/v1/anthropic");
  });

  it("only sets the attribution headers that are given", () => {
    expect(bc.headers({ agent: "a", run: "r1" })).toEqual({ "x-bc-key": "bc_live_test", "x-bc-agent": "a", "x-bc-run": "r1" });
  });

  it("rejects keys that aren't BurnCap keys", () => {
    expect(() => new BurnCap({ key: "sk-openai" })).toThrow();
  });

  it("recognises budget errors from both provider SDK shapes", () => {
    // OpenAI SDK: err.error is the inner error object
    expect(isBudgetError({ status: 402, error: { type: "budget_exceeded" } })).toBe(true);
    // Anthropic SDK: err.error is the whole body
    expect(isBudgetError({ status: 429, error: { type: "error", error: { type: "budget_throttled" } } })).toBe(true);
    // A provider's own rate limit is not a budget error
    expect(isBudgetError({ status: 429, error: { type: "rate_limit_error" } })).toBe(false);
    expect(isBudgetError(new Error("boom"))).toBe(false);
  });

  it("makes prefixed run ids", () => {
    expect(newRunId("pr")).toMatch(/^pr_[a-z0-9]{1,8}$/);
  });
});
