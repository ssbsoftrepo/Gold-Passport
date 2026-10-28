import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { cacheGeneration, readCache, writeCache } from "./cache";
import { useOutbox } from "./outbox";

/**
 * Loads data when the screen gains focus and after the outbox replays queued actions.
 * Keeps the last data on error so screens still show something offline. With a `cacheKey` the last
 * data is also saved on the device: the screen shows it at once (even after a restart without
 * signal) while fresh data loads. `staleSince` is when the shown data was loaded, set while the
 * latest refresh failed.
 *
 * Reloads can overlap (focus, pull-to-refresh, outbox sync) and on a weak signal finish in any
 * order; only the newest one, or a later `setData` from an action, decides what is shown.
 */
export function useScreenData<T>(load: () => Promise<T>, cacheKey?: string) {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const loadRef = useRef(load);
  const hasData = useRef(false);
  const latest = useRef(0);
  const inFlight = useRef(0);
  const { onSynced } = useOutbox();

  const show = useCallback(
    (next: T, generation: number) => {
      const now = new Date().toISOString();
      hasData.current = true;
      setDataState(next);
      setLoadedAt(now);
      if (cacheKey) void writeCache(cacheKey, next, now, generation);
    },
    [cacheKey],
  );

  /** For results of actions: newer than any reload still in flight, so those are ignored. */
  const setData = useCallback(
    (next: T) => {
      latest.current += 1;
      show(next, cacheGeneration());
    },
    [show],
  );

  useEffect(() => {
    loadRef.current = load;
  });

  const reload = useCallback(async () => {
    const mine = ++latest.current;
    const generation = cacheGeneration();
    inFlight.current += 1;
    setLoading(true);
    try {
      if (cacheKey && !hasData.current) {
        const cached = await readCache<T>(cacheKey);
        if (cached && !hasData.current) {
          hasData.current = true;
          setDataState(cached.data);
          setLoadedAt(cached.savedAt);
        }
      }
      const result = await loadRef.current();
      if (mine !== latest.current) return; // something newer has been shown
      show(result, generation);
      setError(null);
    } catch (e) {
      if (mine === latest.current) setError(e);
    } finally {
      inFlight.current -= 1;
      if (inFlight.current === 0) setLoading(false);
    }
  }, [cacheKey, show]);

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
