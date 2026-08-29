"use client";

import { useMemo, type MutableRefObject } from "react";

/**
 * Returns a stable setter for storing DOM elements into a ref-held array by
 * index — used to collect the day-column elements for pointer geometry.
 */
export function useCallbackRef<T>(
  ref: MutableRefObject<(T | null)[]>,
): (index: number, el: T | null) => void {
  return useMemo(() => (index: number, el: T | null) => {
    ref.current[index] = el;
  }, [ref]);
}
