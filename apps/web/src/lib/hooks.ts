"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Loads data on mount (and when deps change) and exposes a reload. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loadRef.current());
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetching on mount is the purpose of this hook; the loading flag is set synchronously on purpose.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload, setData };
}

/** Runs a mutation, tracking pending state and the last error. */
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    setPending(true);
    setError(null);
    try {
      return await action();
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);

  return { pending, error, run, clearError: () => setError(null) };
}
