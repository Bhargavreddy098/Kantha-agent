"use client";

import { useSyncExternalStore } from "react";

/** Nothing to subscribe to: the mounted flag flips once, after hydration. */
const subscribe = () => () => {};

/**
 * True once the component has hydrated, false during the server render and the
 * first client render.
 *
 * Use it to defer browser-only UI, so the first client render matches the
 * markup the server produced instead of triggering a hydration mismatch.
 */
export function useIsMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
