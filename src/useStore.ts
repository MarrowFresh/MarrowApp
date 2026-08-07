import { useSyncExternalStore } from "react";
import { store } from "./lib/data";

// Re-render any component when the local store changes.
export function useDB() {
  return useSyncExternalStore(store.subscribe, store.get);
}
