import { describe, it, expect } from "vitest";
import { startTimer, endTimer, measureAsync } from "../lib/performance.js";

describe("performance utilities", () => {
  it("returns 0 for an unknown label", () => {
    expect(endTimer("never-started")).toBe(0);
  });

  it("returns 0 on second call for the same label", () => {
    startTimer("once");
    endTimer("once");
    expect(endTimer("once")).toBe(0);
  });

  it("returns a positive elapsed value after a real delay", async () => {
    startTimer("delay-test");
    await new Promise((r) => setTimeout(r, 10));
    const ms = endTimer("delay-test");
    expect(ms).toBeGreaterThan(0);
  });

  it("measureAsync resolves with the wrapped function result", async () => {
    const result = await measureAsync("wrap", () => Promise.resolve(42));
    expect(result).toBe(42);
  });
});
