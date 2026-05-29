"use client";

import { useEffect, useState } from "react";

/**
 * Delays updating the returned value until the input has stopped changing for
 * `delayMs` milliseconds. Useful for cutting redundant re-renders triggered by
 * fast-changing inputs such as search fields.
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
