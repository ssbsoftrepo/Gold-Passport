import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOutbox } from "./outbox";

/**
 * Loads data when the screen gains focus and after the outbox replays queued actions.
 * Keeps the last data on error so screens still show something offline.
 */
export function useScreenData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const loadRef = useRef(load);
  const { onSynced } = useOutbox();

  useEffect(() => {
    loadRef.current = load;
  });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => onSynced(() => void reload()), [onSynced, reload]);

  return { data, error, loading, reload, setData };
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
