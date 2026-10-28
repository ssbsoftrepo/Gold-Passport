import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { readCache, writeCache } from "./cache";
import { useOutbox } from "./outbox";

/**
 * Loads data when the screen gains focus and after the outbox replays queued actions.
 * Keeps the last data on error so screens still show something offline. With a `cacheKey` the last
 * data is also saved on the device: the screen shows it at once (even after a restart without
 * signal) while fresh data loads. `staleSince` is when the shown data was loaded, set while the
 * latest refresh failed.
 */
export function useScreenData<T>(load: () => Promise<T>, cacheKey?: string) {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const loadRef = useRef(load);
  const hasData = useRef(false);
  const { onSynced } = useOutbox();

  const setData = useCallback(
    (next: T) => {
      const now = new Date().toISOString();
      hasData.current = true;
      setDataState(next);
      setLoadedAt(now);
      if (cacheKey) void writeCache(cacheKey, next, now);
    },
    [cacheKey],
  );

  useEffect(() => {
    loadRef.current = load;
  });

  const reload = useCallback(async () => {
    setLoading(true);
    if (cacheKey && !hasData.current) {
      const cached = await readCache<T>(cacheKey);
      if (cached && !hasData.current) {
        hasData.current = true;
        setDataState(cached.data);
        setLoadedAt(cached.savedAt);
      }
    }
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [cacheKey, setData]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => onSynced(() => void reload()), [onSynced, reload]);

  const staleSince = error && data !== undefined ? loadedAt : null;
  return { data, error, loading, reload, setData, staleSince };
}

export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setPending(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);
  return { pending, error, run, setError };
}
