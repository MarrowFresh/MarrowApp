import { useCallback, useEffect, useState } from "react";

// Load-from-API + reload-after-save, shared by the config screens.
//
// Every one of these pages used to read and write localStorage, so saving felt
// instant but changed nothing for customers. Going through the API means a save
// can fail — so each page needs loading, error and saving states. This keeps that
// identical across all five rather than five slightly different versions.
export function useResource<T>(load: () => Promise<T>, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    return load()
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(readable(e)))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => { refresh(); }, [refresh]);

  // Run a mutation, then reload so the screen shows what the database actually
  // holds — not what we hoped it would hold.
  const mutate = useCallback(async (fn: () => Promise<unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
      await refresh();
      return true;
    } catch (e) {
      setError(readable(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, [refresh]);

  return { data, setData, loading, error, saving, refresh, mutate };
}

function readable(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/failed to fetch/i.test(msg)) return "Can't reach the server — check your connection.";
  return msg;
}
