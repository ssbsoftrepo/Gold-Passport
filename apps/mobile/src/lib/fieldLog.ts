import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Paths } from "expo-file-system";
import { AppState } from "react-native";
import { API_BASE_URL, ApiError, NetworkError, isTransientError } from "./api";

/**
 * Field log: a short record, kept on the phone, of what the app met in the field (signal, sending,
 * GPS accuracy), so a field trial or a support call can see what happened at the mine or on the
 * road. Only the last MAX_EVENTS events are kept, and they leave the phone only when the user sends
 * a field report from Profile.
 *
 * It holds no personal data: no names, phone numbers, coordinates, tokens or request bodies. Paths
 * are reduced to their pattern ("/api/v1/lots/:id/evidence").
 */

type Base = { at: string };
export type SendOutcome = "sent" | "retry" | "failed" | "signin";
export type FieldEvent = Base &
  (
    | { type: "app"; state: "start" | "active" | "background" }
    | { type: "network"; connected: boolean | null; reachable: boolean | null; kind: string; generation: string | null }
    | {
        type: "send";
        path: string;
        replay: boolean;
        outcome: SendOutcome;
        ms: number;
        bytes: number | null;
        error: string | null;
      }
    | { type: "queued"; path: string; bytes: number | null }
    | { type: "gps"; ms: number; accuracyM: number | null; lastKnown: boolean; error: string | null }
  );
type NewEvent = FieldEvent extends infer E ? (E extends FieldEvent ? Omit<E, "at"> : never) : never;

const STORAGE_KEY = "pmd.field-log";
export const MAX_EVENTS = 300;
const SAVE_DELAY_MS = 3_000;

let events: FieldEvent[] = [];
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let loaded: Promise<void> | null = null;

function save() {
  saveTimer = null;
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(events)).catch(() => {
    // a full disk must not break field work; the log is only diagnostics
  });
}

/** Adds an event. Saving is batched, so recording costs nothing on the request path. */
export function record(event: NewEvent) {
  events.push({ ...event, at: new Date().toISOString() } as FieldEvent);
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
  if (!saveTimer) saveTimer = setTimeout(save, SAVE_DELAY_MS);
}

/** Loads the events saved before this start; events recorded meanwhile are kept after them. */
export function loadFieldLog(): Promise<void> {
  loaded ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      const saved = raw ? (JSON.parse(raw) as FieldEvent[]) : [];
      events = [...saved, ...events].slice(-MAX_EVENTS);
    })
    .catch(() => undefined);
  return loaded;
}

export function fieldEvents(): readonly FieldEvent[] {
  return events;
}

export async function clearFieldLog() {
  events = [];
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/** Test hook: forgets in-memory state as if the app had been restarted. */
export function resetFieldLogForTests() {
  events = [];
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  loaded = null;
}

const ID = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi;

/** "/api/v1/lots/5bd3…/evidence" → "/api/v1/lots/:id/evidence". */
export function pathPattern(path: string): string {
  return path.split("?")[0].replace(ID, "/:id");
}

/** A short, non-personal name for an error: the API code, or what kind of network failure. */
export function errorName(e: unknown): string {
  if (e instanceof NetworkError) return e.timedOut ? "TIMEOUT" : "NO_ANSWER";
  if (e instanceof ApiError) return e.code;
  if (e instanceof Error) return e.name;
  return "UNKNOWN";
}

export function sendOutcome(e: unknown): SendOutcome {
  if (e instanceof ApiError && e.status === 401) return "signin";
  return isTransientError(e) ? "retry" : "failed";
}

function networkEvent(state: NetInfoState): NewEvent {
  const details = state.details as { cellularGeneration?: string | null } | null;
  return {
    type: "network",
    connected: state.isConnected,
    reachable: state.isInternetReachable,
    kind: state.type,
    generation: details?.cellularGeneration ?? null,
  };
}

/** Starts recording connectivity and app state changes. Returns a stop function. */
export function startFieldLog(): () => void {
  void loadFieldLog();
  record({ type: "app", state: "start" });
  let last = "";
  const unsubscribeNet = NetInfo.addEventListener((state) => {
    const event = networkEvent(state);
    const key = JSON.stringify(event);
    if (key === last) return; // NetInfo repeats unchanged states
    last = key;
    record(event);
  });
  const appState = AppState.addEventListener("change", (s) => {
    if (s === "active" || s === "background") record({ type: "app", state: s });
  });
  return () => {
    unsubscribeNet();
    appState.remove();
  };
}

// ---------------------------------------------------------------- report

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function count<T extends string>(values: T[]): Partial<Record<T, number>> {
  const result: Partial<Record<T, number>> = {};
  for (const v of values) result[v] = (result[v] ?? 0) + 1;
  return result;
}

export type FieldSummary = {
  from: string | null;
  to: string | null;
  sends: {
    attempts: number;
    outcomes: Partial<Record<SendOutcome, number>>;
    errors: Partial<Record<string, number>>;
    medianMs: number | null;
    /** Median upload speed of successful uploads with a known size, in KB/s. */
    medianUploadKBps: number | null;
  };
  queued: number;
  network: { changes: number; offlineChanges: number; kinds: Partial<Record<string, number>> };
  gps: {
    readings: number;
    failures: number;
    lastKnownFallbacks: number;
    medianAccuracyM: number | null;
    worstAccuracyM: number | null;
    medianFixMs: number | null;
  };
};

/** The numbers a field trial checks, from the events. Pure, so it is easy to test. */
export function summarize(log: readonly FieldEvent[]): FieldSummary {
  const sends = log.filter((e) => e.type === "send");
  const gps = log.filter((e) => e.type === "gps");
  const network = log.filter((e) => e.type === "network");
  const fixes = gps.filter((e) => !e.error);
  const accuracies = fixes.map((e) => e.accuracyM).filter((a): a is number => a !== null);
  const uploads = sends.filter((e) => e.outcome === "sent" && e.bytes && e.ms > 0);
  return {
    from: log[0]?.at ?? null,
    to: log[log.length - 1]?.at ?? null,
    sends: {
      attempts: sends.length,
      outcomes: count(sends.map((e) => e.outcome)),
      errors: count(sends.flatMap((e) => (e.error ? [e.error] : []))),
      medianMs: median(sends.map((e) => e.ms)),
      medianUploadKBps: median(uploads.map((e) => Math.round((e.bytes ?? 0) / 1024 / (e.ms / 1000)))),
    },
    queued: log.filter((e) => e.type === "queued").length,
    network: {
      changes: network.length,
      offlineChanges: network.filter((e) => e.connected === false || e.reachable === false).length,
      kinds: count(network.map((e) => (e.generation ? `${e.kind}/${e.generation}` : e.kind))),
    },
    gps: {
      readings: gps.length,
      failures: gps.filter((e) => e.error).length,
      lastKnownFallbacks: fixes.filter((e) => e.lastKnown).length,
      medianAccuracyM: median(accuracies),
      worstAccuracyM: accuracies.length ? Math.max(...accuracies) : null,
      medianFixMs: median(fixes.map((e) => e.ms)),
    },
  };
}

type OutboxState = { id: string; createdAt: string; error?: string }[];

function freeStorageMB(): number | null {
  try {
    return Math.round(Paths.availableDiskSpace / 1024 / 1024);
  } catch {
    return null;
  }
}

/**
 * The report a tester sends from Profile: app and phone, free storage, what is waiting in the
 * outbox (counts and error codes only), the summary and the raw events.
 */
export async function fieldReport(outbox: OutboxState) {
  await loadFieldLog();
  const pending = outbox.filter((i) => !i.error);
  return {
    report: "pmd-field-report/1",
    createdAt: new Date().toISOString(),
    app: {
      version: Constants.expoConfig?.version ?? null,
      server: new URL(API_BASE_URL).host,
    },
    device: {
      brand: Device.brand,
      model: Device.modelName,
      os: `${Device.osName ?? "?"} ${Device.osVersion ?? "?"}`,
      androidApiLevel: Device.platformApiLevel,
      memoryMB: Device.totalMemory ? Math.round(Device.totalMemory / 1024 / 1024) : null,
      yearClass: Device.deviceYearClass,
      realDevice: Device.isDevice,
      freeStorageMB: freeStorageMB(),
    },
    outbox: {
      pending: pending.length,
      failed: outbox.length - pending.length,
      oldestPendingAt: pending[0]?.createdAt ?? null,
    },
    summary: summarize(events),
    events,
  };
}
