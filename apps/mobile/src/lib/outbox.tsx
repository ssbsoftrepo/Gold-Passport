import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Directory, File, Paths } from "expo-file-system";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { ApiError, isTransientError, onAccessTokenChange, postJson, uploadMultipart } from "./api";
import { errorName, pathPattern, record, sendOutcome } from "./fieldLog";

/**
 * Offline outbox for field actions (extraction photos, GPS checkpoints, handover).
 *
 * Mines and roads often have no signal, or a signal so weak that requests hang. Actions are
 * attempted immediately; if the request gets no answer (offline, timeout, server error) it is
 * stored (with a copy of the photo in app storage) and replayed in order: when connectivity
 * returns, when the app comes to the foreground, and on a backoff timer (10 s doubling to 5 min),
 * because a weak signal often never shows up as "disconnected". The device time of the capture is
 * sent with each item, so the ledger keeps when and where it really happened.
 *
 * Every item carries an idempotency key (its id) from the first attempt on. When a request reached
 * the server but the answer was lost, the replay gets the original result back instead of adding
 * the photo or GPS step a second time.
 *
 * Business errors (4xx) are not retried: the item is marked failed and shown in Profile. A 401
 * (the session expired while offline) pauses the queue until the user signs in again.
 */

type JsonItem = { kind: "json"; path: string; body: unknown };
type UploadItem = {
  kind: "upload";
  path: string;
  fileUri: string;
  fileName: string;
  mimeType: string;
  fields: Record<string, string>;
};
export type OutboxItem = (JsonItem | UploadItem) & {
  id: string;
  label: string;
  createdAt: string;
  /** Group key so screens can show "n pending" (e.g. "lot:<id>"). */
  scope: string;
  error?: string;
};

export type NewItem = JsonItem | UploadItem;
type SubmitResult<T> = { status: "sent"; result: T } | { status: "queued" };

type Outbox = {
  items: OutboxItem[];
  syncing: boolean;
  /** The server rejected the session; pending items wait until the user signs in again. */
  needsSignIn: boolean;
  submit: <T>(item: NewItem, meta: { label: string; scope: string }) => Promise<SubmitResult<T>>;
  syncNow: () => Promise<void>;
  discard: (id: string) => Promise<void>;
  /** Called after a successful replay so screens can reload. */
  onSynced: (listener: () => void) => () => void;
};

const STORAGE_KEY = "pmd.outbox";
const FIRST_RETRY_MS = 10_000;
const MAX_RETRY_MS = 5 * 60_000;
const Ctx = createContext<Outbox | null>(null);

function outboxDir(): Directory {
  const dir = new Directory(Paths.document, "outbox");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function photoBytes(item: NewItem): number | null {
  if (item.kind !== "upload") return null;
  try {
    return new File(item.fileUri).size;
  } catch {
    return null;
  }
}

/** Sends one item and notes in the field log how it went and how long it took. */
async function send(item: NewItem, idempotencyKey: string, replay: boolean): Promise<unknown> {
  const started = Date.now();
  const note = { type: "send" as const, path: pathPattern(item.path), replay, bytes: photoBytes(item) };
  try {
    const result =
      item.kind === "json"
        ? await postJson(item.path, item.body, idempotencyKey)
        : await uploadMultipart(item.path, { uri: item.fileUri, name: item.fileName, type: item.mimeType }, item.fields, idempotencyKey);
    record({ ...note, outcome: "sent", ms: Date.now() - started, error: null });
    return result;
  } catch (e) {
    record({ ...note, outcome: sendOutcome(e), ms: Date.now() - started, error: errorName(e) });
    throw e;
  }
}

/**
 * Deletes photo copies no queued item owns: left behind when the app was killed between copying a
 * photo and saving the queue, or when saving the queue failed. Copies are named `<item id>-<name>`;
 * a file is kept while any queued item, or a submit still in progress (`busyIds`), has that id.
 */
function removeOrphanFiles(items: OutboxItem[], busyIds: Set<string>) {
  try {
    const dir = new Directory(Paths.document, "outbox");
    if (!dir.exists) return;
    const owners = [...items.map((i) => i.id), ...busyIds];
    for (const entry of dir.list()) {
      if (!(entry instanceof File)) continue;
      if (owners.some((id) => entry.name.startsWith(`${id}-`))) continue;
      entry.delete();
    }
  } catch {
    // best effort; tried again at the next start
  }
}

function hasPending(items: OutboxItem[]): boolean {
  return items.some((i) => !i.error);
}

function isUnauthorized(e: unknown): boolean {
  return e instanceof ApiError && e.status === 401;
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function OutboxProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const itemsRef = useRef<OutboxItem[]>([]);
  const listeners = useRef(new Set<() => void>());
  const busy = useRef(false);
  const authBlocked = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(FIRST_RETRY_MS);
  const syncRef = useRef<() => Promise<void>>(async () => undefined);
  /** Ids of submits between copying their photo and saving the queue. */
  const copying = useRef(new Set<string>());

  const setBlocked = useCallback((blocked: boolean) => {
    authBlocked.current = blocked;
    setNeedsSignIn(blocked);
  }, []);

  const cancelRetry = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
  }, []);

  /** Tries again later, waiting twice as long after each failed round (up to MAX_RETRY_MS). */
  const scheduleRetry = useCallback(() => {
    if (retryTimer.current || authBlocked.current || !hasPending(itemsRef.current)) return;
    const delay = retryDelay.current;
    retryDelay.current = Math.min(delay * 2, MAX_RETRY_MS);
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      void syncRef.current();
    }, delay);
  }, []);

  /** A better moment to try (signal back, app opened, button pressed): try now, restart the backoff. */
  const retrySoon = useCallback(() => {
    cancelRetry();
    retryDelay.current = FIRST_RETRY_MS;
    if (hasPending(itemsRef.current)) void syncRef.current();
  }, [cancelRetry]);

  const persist = useCallback(async (next: OutboxItem[]) => {
    itemsRef.current = next;
    setItems(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const syncNow = useCallback(async () => {
    if (busy.current || authBlocked.current) return;
    busy.current = true;
    cancelRetry();
    setSyncing(true);
    let sentAny = false;
    let interrupted = false;
    try {
      for (const item of [...itemsRef.current]) {
        if (item.error) continue;
        try {
          await send(item, item.id, true);
          if (item.kind === "upload") {
            try {
              new File(item.fileUri).delete();
            } catch {
              // already gone
            }
          }
          await persist(itemsRef.current.filter((i) => i.id !== item.id));
          sentAny = true;
        } catch (e) {
          if (isUnauthorized(e)) {
            setBlocked(true);
            interrupted = true;
            break;
          }
          if (isTransientError(e)) {
            interrupted = true; // weak or no signal: keep order, try later
            break;
          }
          const message = e instanceof Error ? e.message : String(e);
          await persist(itemsRef.current.map((i) => (i.id === item.id ? { ...i, error: message } : i)));
        }
      }
    } finally {
      busy.current = false;
      setSyncing(false);
      if (interrupted) scheduleRetry();
      else retryDelay.current = FIRST_RETRY_MS;
      if (sentAny) listeners.current.forEach((l) => l());
    }
  }, [persist, cancelRetry, scheduleRetry, setBlocked]);

  useEffect(() => {
    syncRef.current = syncNow;
  }, [syncNow]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      const loaded = raw ? (JSON.parse(raw) as OutboxItem[]) : [];
      itemsRef.current = loaded;
      setItems(loaded);
      removeOrphanFiles(loaded, copying.current);
      retrySoon();
    });
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) retrySoon();
    });
    const appState = AppState.addEventListener("change", (s) => {
      if (s === "active") retrySoon();
    });
    const unsubscribeToken = onAccessTokenChange((token) => {
      if (!token) return;
      setBlocked(false);
      retrySoon();
    });
    return () => {
      unsubscribeNet();
      appState.remove();
      unsubscribeToken();
      cancelRetry();
    };
  }, [retrySoon, cancelRetry, setBlocked]);

  const submit = useCallback(
    async <T,>(item: NewItem, meta: { label: string; scope: string }): Promise<SubmitResult<T>> => {
      // The id doubles as the idempotency key, so a retry of this exact action is recognised.
      const id = newId();
      // Keep strict ordering: if something is already queued, queue behind it.
      if (!hasPending(itemsRef.current) && !authBlocked.current) {
        try {
          return { status: "sent", result: (await send(item, id, false)) as T };
        } catch (e) {
          if (isUnauthorized(e)) setBlocked(true);
          else if (!isTransientError(e)) throw e;
        }
      }
      let stored: NewItem = item;
      copying.current.add(id);
      try {
        if (item.kind === "upload") {
          // Photo picker files live in a cache the OS may clear; keep our own copy until sent.
          const source = new File(item.fileUri);
          const target = new File(outboxDir(), `${id}-${item.fileName}`);
          await source.copy(target);
          stored = { ...item, fileUri: target.uri };
        }
        await persist([...itemsRef.current, { ...stored, id, createdAt: new Date().toISOString(), ...meta }]);
        record({ type: "queued", path: pathPattern(item.path), bytes: photoBytes(stored) });
      } finally {
        copying.current.delete(id);
      }
      scheduleRetry();
      return { status: "queued" };
    },
    [persist, scheduleRetry, setBlocked],
  );

  const discard = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (item?.kind === "upload") {
        try {
          new File(item.fileUri).delete();
        } catch {
          // ignore
        }
      }
      await persist(itemsRef.current.filter((i) => i.id !== id));
    },
    [persist],
  );

  const onSynced = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const manualSync = useCallback(async () => {
    retryDelay.current = FIRST_RETRY_MS;
    await syncNow();
  }, [syncNow]);

  const value = useMemo<Outbox>(
    () => ({ items, syncing, needsSignIn, submit, syncNow: manualSync, discard, onSynced }),
    [items, syncing, needsSignIn, submit, manualSync, discard, onSynced],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOutbox(): Outbox {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOutbox must be used inside <OutboxProvider>");
  return ctx;
}
