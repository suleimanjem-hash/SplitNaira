import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "./useDebounce";

describe("useDebounce", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("hello", 300));
    expect(result.current).toBe("hello");
  });

  it("updates the value only after the delay has elapsed", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ val }: { val: string }) => useDebounce(val, 300),
      { initialProps: { val: "initial" } },
    );
    rerender({ val: "updated" });
    expect(result.current).toBe("initial");
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current).toBe("updated");
  });

  it("coalesces rapid updates into a single propagation", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ val }: { val: string }) => useDebounce(val, 300),
      { initialProps: { val: "a" } },
    );
    rerender({ val: "b" });
    rerender({ val: "c" });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current).toBe("c");
  });
});
