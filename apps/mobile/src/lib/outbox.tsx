import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Directory, File, Paths } from "expo-file-system";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { isNetworkError, postJson, uploadMultipart } from "./api";

/**
 * Offline outbox for field actions (extraction photos, GPS checkpoints, handover).
 *
 * Mines and roads often have no signal. Actions are attempted immediately; if the request
 * cannot reach the server it is stored (with a copy of the photo in app storage) and replayed
 * in order when connectivity returns or the app comes to the foreground. The device time of the
 * capture is sent with each item, so the ledger keeps when and where it really happened.
 *
 * Business errors (4xx) are not retried: the item is marked failed and shown in Profile.
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
  submit: <T>(item: NewItem, meta: { label: string; scope: string }) => Promise<SubmitResult<T>>;
  syncNow: () => Promise<void>;
  discard: (id: string) => Promise<void>;
  /** Called after a successful replay so screens can reload. */
  onSynced: (listener: () => void) => () => void;
};

const STORAGE_KEY = "pmd.outbox";
const Ctx = createContext<Outbox | null>(null);

function outboxDir(): Directory {
  const dir = new Directory(Paths.document, "outbox");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

async function send(item: NewItem): Promise<unknown> {
  if (item.kind === "json") return postJson(item.path, item.body);
  return uploadMultipart(item.path, { uri: item.fileUri, name: item.fileName, type: item.mimeType }, item.fields);
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function OutboxProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const itemsRef = useRef<OutboxItem[]>([]);
  const listeners = useRef(new Set<() => void>());
  const busy = useRef(false);

  const persist = useCallback(async (next: OutboxItem[]) => {
    itemsRef.current = next;
    setItems(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const syncNow = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setSyncing(true);
    let sentAny = false;
    try {
      for (const item of [...itemsRef.current]) {
        if (item.error) continue;
        try {
          await send(item);
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
          if (isNetworkError(e)) break; // still offline: keep order, try later
          const message = e instanceof Error ? e.message : String(e);
          await persist(itemsRef.current.map((i) => (i.id === item.id ? { ...i, error: message } : i)));
        }
      }
    } finally {
      busy.current = false;
      setSyncing(false);
      if (sentAny) listeners.current.forEach((l) => l());
    }
  }, [persist]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      const loaded = raw ? (JSON.parse(raw) as OutboxItem[]) : [];
      itemsRef.current = loaded;
      setItems(loaded);
      if (loaded.length > 0) void syncNow();
    });
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      if (state.isConnected && itemsRef.current.length > 0) void syncNow();
    });
    const appState = AppState.addEventListener("change", (s) => {
      if (s === "active" && itemsRef.current.length > 0) void syncNow();
    });
    return () => {
      unsubscribeNet();
      appState.remove();
    };
  }, [syncNow]);

  const submit = useCallback(
    async <T,>(item: NewItem, meta: { label: string; scope: string }): Promise<SubmitResult<T>> => {
      // Keep strict ordering: if something is already queued, queue behind it.
      if (itemsRef.current.filter((i) => !i.error).length === 0) {
        try {
          return { status: "sent", result: (await send(item)) as T };
        } catch (e) {
          if (!isNetworkError(e)) throw e;
        }
      }
      const id = newId();
      let stored: NewItem = item;
      if (item.kind === "upload") {
        // Photo picker files live in a cache the OS may clear; keep our own copy until sent.
        const source = new File(item.fileUri);
        const target = new File(outboxDir(), `${id}-${item.fileName}`);
        await source.copy(target);
        stored = { ...item, fileUri: target.uri };
      }
      await persist([...itemsRef.current, { ...stored, id, createdAt: new Date().toISOString(), ...meta }]);
      return { status: "queued" };
    },
    [persist],
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

  const value = useMemo<Outbox>(
    () => ({ items, syncing, submit, syncNow, discard, onSynced }),
    [items, syncing, submit, syncNow, discard, onSynced],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOutbox(): Outbox {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOutbox must be used inside <OutboxProvider>");
  return ctx;
}
