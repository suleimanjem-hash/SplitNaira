"use client";

/**
 * Hook for async operations with consistent loading/error/stale state (#293).
 *
 * Eliminates the silent-failure and inconsistent-UI patterns that emerge when
 * callers manage their own `loading`/`error`/`data` triplets manually.
 *
 * Features:
 *  - Automatic AbortController wiring — inflight requests are cancelled when
 *    the component unmounts or deps change, preventing stale state updates.
 *  - `isStale` flag: set when a new fetch is triggered before the previous
 *    result has settled, so the UI can show a "refreshing" indicator rather
 *    than clearing visible data.
 *  - Typed error extraction so `error.message` is always a string.
 *
 * @example
 * const { data, isLoading, isStale, error, execute } = useAsyncState(
 *   async (signal) => fetchSplitProject(projectId, { signal }),
 *   [projectId],
 * );
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  /** True when data is present but a refresh is in progress. */
  isStale: boolean;
  error: string | null;
  /** Manually trigger the async function (e.g. on a Retry button). */
  execute: () => void;
}

type AsyncFn<T> = (signal: AbortSignal) => Promise<T>;

/**
 * @param fn   Async factory that receives an AbortSignal. Must throw on error.
 * @param deps Re-run `fn` when any dependency changes (like useEffect deps).
 */
export function useAsyncState<T>(
  fn: AsyncFn<T>,
  deps: React.DependencyList,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep a stable ref to the latest fn so the effect closure captures it
  const fnRef = useRef(fn);
  fnRef.current = fn;

  // Generation counter — lets us discard responses from superseded requests
  const generationRef = useRef(0);

  const run = useCallback(() => {
    const generation = ++generationRef.current;
    const controller = new AbortController();

    // If we already have data, show "stale" rather than blanking the screen
    setIsStale((prev) => (prev === false ? false : true));
    setIsLoading(true);
    setError(null);
    if (data !== null) setIsStale(true);

    fnRef.current(controller.signal)
      .then((result) => {
        if (generation !== generationRef.current) return; // superseded
        setData(result);
        setError(null);
        setIsStale(false);
      })
      .catch((err: unknown) => {
        if (generation !== generationRef.current) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
        setIsStale(false);
      })
      .finally(() => {
        if (generation !== generationRef.current) return;
        setIsLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, isLoading, isStale, error, execute: run };
}
