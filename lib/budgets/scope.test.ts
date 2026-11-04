import { describe, expect, it } from "vitest";
import { applicableBudgets, withinPlan } from "./scope";
import { safeNext } from "@/lib/safe-next";
import type { Budget } from "@/types/domain";

const budget = (over: Partial<Budget>): Budget => ({
  id: Math.random().toString(36),
  workspaceId: "ws",
  scope: "workspace",
  scopeId: null,
  period: "daily",
  limitMicros: 1_000_000,
  action: "pause",
  throttleRpm: 5,
  alertThresholds: [50, 80, 100],
  enabled: true,
  ...over,
});

describe("withinPlan", () => {
  it("caps free workspaces at 2 budgets, oldest first", () => {
    const bs = [budget({ id: "a" }), budget({ id: "b" }), budget({ id: "c" })];
    expect(withinPlan(bs, "free").map((b) => b.id)).toEqual(["a", "b"]);
    expect(withinPlan(bs, "pro")).toHaveLength(3);
  });

  it("downgrades throttle to alert and drops customer budgets on free", () => {
    const bs = [budget({ action: "throttle" }), budget({ scope: "customer", scopeId: "cus_1" })];
    const free = withinPlan(bs, "free");
    expect(free).toHaveLength(1);
    expect(free[0].action).toBe("alert");
    expect(withinPlan(bs, "pro")[0].action).toBe("throttle");
  });
});

describe("applicableBudgets", () => {
  const bs = [
    budget({ id: "ws" }),
    budget({ id: "agent-a", scope: "agent", scopeId: "a" }),
    budget({ id: "agent-b", scope: "agent", scopeId: "b" }),
    budget({ id: "cus", scope: "customer", scopeId: "c1" }),
  ];

  it("matches workspace, the request's agent and its customer", () => {
    expect(applicableBudgets(bs, "pro", "a", "c1").map((b) => b.id)).toEqual(["ws", "agent-a", "cus"]);
    expect(applicableBudgets(bs, "pro", "b", null).map((b) => b.id)).toEqual(["ws", "agent-b"]);
  });
});

describe("safeNext", () => {
  it("allows relative paths and rejects open redirects", () => {
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
    expect(safeNext("//evil.com")).toBe("/app");
    expect(safeNext("/\\evil.com")).toBe("/app");
    expect(safeNext("https://evil.com")).toBe("/app");
    expect(safeNext(null)).toBe("/app");
  });
});
