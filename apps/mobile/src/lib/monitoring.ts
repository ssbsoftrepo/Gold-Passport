import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import * as Sentry from "@sentry/react-native";
import type { Breadcrumb, ErrorEvent } from "@sentry/react-native";
import { useEffect, useRef } from "react";
import { errorName, fieldEvents, pathPattern } from "./fieldLog";
import { useOutbox, type OutboxItem } from "./outbox";

/**
 * Crash and problem reports from phones, sent to Sentry when the build sets
 * `EXPO_PUBLIC_SENTRY_DSN` (see docs/monitoring.md). Without it nothing is sent.
 *
 * Besides crashes, it reports the two ways field work can silently fail to reach the server:
 * - an item the server refused (a business error), which waits in Profile until the user discards it;
 * - a queue that does not empty: work older than STUCK_AFTER_MS still pending after the phone has
 *   been online for ONLINE_FOR_MS (with signal, the queue normally empties within a minute).
 *
 * Reports hold no personal data (Ley 29733): no user, screenshots, console output or taps; request
 * URLs are reduced to their pattern; server messages, which may name people, are never sent, only
 * their codes.
 */

export const STUCK_AFTER_MS = 6 * 60 * 60_000;
export const ONLINE_FOR_MS = 15 * 60_000;
const CHECK_EVERY_MS = 5 * 60_000;
const REPORT_STUCK_EVERY_MS = 24 * 60 * 60_000;
const STORAGE_KEY = "pmd.monitoring";
const REMEMBERED_FAILURES = 50;

export function initMonitoring(dsn = process.env.EXPO_PUBLIC_SENTRY_DSN): boolean {
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? (__DEV__ ? "development" : "production"),
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    // Crash-free sessions, but no performance tracing: it costs data on a weak signal.
    enableAutoSessionTracking: true,
    tracesSampleRate: 0,
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
  });
  return true;
}

/** Keeps the endpoint, drops ids, query strings and fragments. */
export function scrubUrl(url: string): string {
  return pathPattern(url.split("#")[0]);
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const category = breadcrumb.category ?? "";
  // Console output and tapped elements can show names, phone numbers and amounts.
  if (category === "console" || category === "touch" || category.startsWith("ui.")) return null;
  if (typeof breadcrumb.data?.url === "string") {
    return { ...breadcrumb, data: { ...breadcrumb.data, url: scrubUrl(breadcrumb.data.url) } };
  }
  return breadcrumb;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const scrubbed: ErrorEvent = { ...event, user: undefined };
  if (scrubbed.request?.url) scrubbed.request = { ...scrubbed.request, url: scrubUrl(scrubbed.request.url) };
  if (scrubbed.breadcrumbs) {
    scrubbed.breadcrumbs = scrubbed.breadcrumbs.map(scrubBreadcrumb).filter((b): b is Breadcrumb => b !== null);
  }
  if (scrubbed.contexts?.device) {
    // The device's name is often its owner's ("Rosa's phone").
    scrubbed.contexts = { ...scrubbed.contexts, device: { ...scrubbed.contexts.device, name: undefined } };
  }
  if (scrubbed.exception?.values) {
    scrubbed.exception = {
      ...scrubbed.exception,
      // An ApiError's message is the server's text, which may name people.
      values: scrubbed.exception.values.map((v) => (v.type === "ApiError" ? { ...v, value: "(server message removed)" } : v)),
    };
  }
  return scrubbed;
}

export type StuckOutbox = { pending: number; failed: number; oldestPendingHours: number; needsSignIn: boolean };

/** Describes the queue when its oldest pending item has waited longer than STUCK_AFTER_MS. */
export function stuckOutbox(items: OutboxItem[], needsSignIn: boolean, now: number): StuckOutbox | null {
  const pending = items.filter((i) => !i.error);
  if (pending.length === 0) return null;
  const oldest = Math.min(...pending.map((i) => Date.parse(i.createdAt)));
  if (now - oldest < STUCK_AFTER_MS) return null;
  return {
    pending: pending.length,
    failed: items.length - pending.length,
    oldestPendingHours: Math.floor((now - oldest) / 3_600_000),
    needsSignIn,
  };
}

type Remembered = { stuckReportedAt?: number; failedReported?: string[] };

async function remembered(): Promise<Remembered> {
  try {
    return JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "{}") as Remembered;
  } catch {
    return {};
  }
}

async function remember(update: Remembered) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...(await remembered()), ...update }));
}

/** Reports items the server refused, once each. */
export async function reportFailedItems(items: OutboxItem[]) {
  const failed = items.filter((i) => i.error);
  if (failed.length === 0) return;
  const reported = new Set((await remembered()).failedReported ?? []);
  const fresh = failed.filter((i) => !reported.has(i.id));
  if (fresh.length === 0) return;
  for (const item of fresh) {
    const path = pathPattern(item.path);
    const code = item.errorCode ?? "UNKNOWN";
    Sentry.captureMessage("The server refused queued field work", {
      level: "error",
      fingerprint: ["outbox-refused", path, code],
      tags: { path, code },
    });
  }
  const ids = [...reported, ...fresh.map((i) => i.id)].slice(-REMEMBERED_FAILURES);
  await remember({ failedReported: ids });
}

/** Reports a queue that is not emptying, at most once a day. */
export async function reportStuckOutbox(stuck: StuckOutbox, now: number) {
  const { stuckReportedAt } = await remembered();
  if (stuckReportedAt && now - stuckReportedAt < REPORT_STUCK_EVERY_MS) return;
  const lastSend = [...fieldEvents()].reverse().find((e) => e.type === "send" && e.outcome !== "sent");
  Sentry.captureMessage("Field work is stuck on the phone", {
    level: "warning",
    fingerprint: ["outbox-stuck"],
    tags: {
      needs_sign_in: String(stuck.needsSignIn),
      last_send_error: lastSend?.type === "send" ? (lastSend.error ?? "NONE") : "NONE",
    },
    contexts: { outbox: stuck },
  });
  await remember({ stuckReportedAt: now });
}

function isOnline(state: Pick<NetInfoState, "isConnected" | "isInternetReachable">): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

/** Watches the outbox for refused and stuck work; render once inside OutboxProvider. */
export function OutboxMonitor() {
  const { items, needsSignIn } = useOutbox();
  const latest = useRef({ items, needsSignIn });
  const onlineSince = useRef<number | null>(null);

  useEffect(() => {
    latest.current = { items, needsSignIn };
    reportFailedItems(items).catch((e) => console.warn("monitoring:", errorName(e)));
  }, [items, needsSignIn]);

  useEffect(() => {
    const track = (state: Pick<NetInfoState, "isConnected" | "isInternetReachable">) => {
      if (!isOnline(state)) onlineSince.current = null;
      else if (onlineSince.current === null) onlineSince.current = Date.now();
    };
    NetInfo.fetch().then(track, () => undefined);
    const unsubscribe = NetInfo.addEventListener(track);
    const timer = setInterval(() => {
      const now = Date.now();
      if (onlineSince.current === null || now - onlineSince.current < ONLINE_FOR_MS) return;
      const stuck = stuckOutbox(latest.current.items, latest.current.needsSignIn, now);
      if (stuck) reportStuckOutbox(stuck, now).catch((e) => console.warn("monitoring:", errorName(e)));
    }, CHECK_EVERY_MS);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  return null;
}
