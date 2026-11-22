import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sentry from "@sentry/react-native";
import type { ErrorEvent } from "@sentry/react-native";
import { act, render } from "@testing-library/react-native";
import { NetworkError, postJson } from "../api";
import { resetFieldLogForTests } from "../fieldLog";
import {
  ONLINE_FOR_MS,
  OutboxMonitor,
  STUCK_AFTER_MS,
  initMonitoring,
  reportFailedItems,
  reportStuckOutbox,
  scrubBreadcrumb,
  scrubEvent,
  stuckOutbox,
} from "../monitoring";
import { OutboxProvider, type OutboxItem } from "../outbox";
import { emitNetworkChange } from "@/test/netInfo";

jest.mock("@sentry/react-native", () => ({ init: jest.fn(), captureMessage: jest.fn() }));
jest.mock("../api", () => ({ ...jest.requireActual("../api"), postJson: jest.fn() }));

const sentry = Sentry as jest.Mocked<typeof Sentry>;
const post = postJson as jest.MockedFunction<typeof postJson>;

const NOW = Date.parse("2026-10-28T18:00:00Z");
const ID = "5bd345da-8e7f-4b1c-9d2a-0123456789ab";
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const item = (id: string, createdAt: string, extra: Pick<OutboxItem, "error" | "errorCode"> = {}): OutboxItem => ({
  kind: "json",
  path: `/api/v1/transports/${ID}/location`,
  body: { latitude: -14.8 },
  id,
  label: "GPS",
  scope: `transport:${ID}`,
  createdAt,
  ...extra,
});
const messages = () => sentry.captureMessage.mock.calls.map((c) => c[0]);

beforeEach(async () => {
  jest.clearAllMocks();
  resetFieldLogForTests();
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("initMonitoring", () => {
  it("sends nothing unless the build has a DSN", () => {
    expect(initMonitoring(undefined)).toBe(false);
    expect(initMonitoring("")).toBe(false);
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("starts Sentry without personal data, screenshots or tracing", () => {
    expect(initMonitoring("https://key@o1.ingest.sentry.io/1")).toBe(true);
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://key@o1.ingest.sentry.io/1",
        sendDefaultPii: false,
        attachScreenshot: false,
        attachViewHierarchy: false,
        tracesSampleRate: 0,
        beforeSend: scrubEvent,
        beforeBreadcrumb: scrubBreadcrumb,
      }),
    );
  });
});

describe("scrubbing", () => {
  it("drops console output and taps, and reduces request URLs to their pattern", () => {
    expect(scrubBreadcrumb({ category: "console", message: "Rosa Quispe +51987654321" })).toBeNull();
    expect(scrubBreadcrumb({ category: "touch", message: "Rosa Quispe" })).toBeNull();
    expect(scrubBreadcrumb({ category: "ui.click" })).toBeNull();
    expect(
      scrubBreadcrumb({ category: "fetch", data: { method: "POST", url: `https://api.example.pe/api/v1/lots/${ID}/photos?x=1#y` } }),
    ).toEqual({ category: "fetch", data: { method: "POST", url: "https://api.example.pe/api/v1/lots/:id/photos" } });
    expect(scrubBreadcrumb({ category: "app.lifecycle", message: "foreground" })).toEqual({
      category: "app.lifecycle",
      message: "foreground",
    });
  });

  it("removes the user, the device's name, server messages and ids from an event", () => {
    const event = {
      type: undefined,
      user: { id: "u1", ip_address: "{{auto}}" },
      request: { url: `https://api.example.pe/api/v1/lots/${ID}` },
      contexts: { device: { name: "Rosa's phone", model: "SM-A045M" } },
      breadcrumbs: [{ category: "console", message: "+51987654321" }, { category: "navigation" }],
      exception: {
        values: [
          { type: "ApiError", value: "Transport already delivered to Rosa Quispe" },
          { type: "TypeError", value: "undefined is not a function" },
        ],
      },
    } as ErrorEvent;

    const scrubbed = scrubEvent(event);

    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.request?.url).toBe("https://api.example.pe/api/v1/lots/:id");
    expect(scrubbed.contexts?.device).toEqual({ name: undefined, model: "SM-A045M" });
    expect(scrubbed.breadcrumbs).toEqual([{ category: "navigation" }]);
    expect(scrubbed.exception?.values?.map((v) => v.value)).toEqual(["(server message removed)", "undefined is not a function"]);
    expect(JSON.stringify(scrubbed)).not.toMatch(/Rosa|\+519/);
  });
});

describe("stuckOutbox", () => {
  it("is stuck only when pending work is older than the limit", () => {
    expect(stuckOutbox([], false, NOW)).toBeNull();
    expect(stuckOutbox([item("a", hoursAgo(5))], false, NOW)).toBeNull();
    expect(stuckOutbox([item("a", hoursAgo(30), { error: "refused" })], false, NOW)).toBeNull(); // refused, not stuck
    expect(stuckOutbox([item("a", hoursAgo(7)), item("b", hoursAgo(1)), item("c", hoursAgo(9), { error: "x" })], true, NOW)).toEqual({
      pending: 2,
      failed: 1,
      oldestPendingHours: 7,
      needsSignIn: true,
    });
    expect(STUCK_AFTER_MS).toBe(6 * 3_600_000);
  });
});

describe("reports", () => {
  it("reports each refused item once, by code and path pattern, never the server's message", async () => {
    const refused = item("a", hoursAgo(1), { error: "Transport already delivered to Rosa Quispe", errorCode: "INVALID_STATE" });

    await reportFailedItems([refused, item("b", hoursAgo(1))]);
    await reportFailedItems([refused]);

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith("The server refused queued field work", {
      level: "error",
      fingerprint: ["outbox-refused", "/api/v1/transports/:id/location", "INVALID_STATE"],
      tags: { path: "/api/v1/transports/:id/location", code: "INVALID_STATE" },
    });
    expect(JSON.stringify(sentry.captureMessage.mock.calls)).not.toContain("Rosa");
  });

  it("reports a stuck queue at most once a day", async () => {
    const stuck = { pending: 3, failed: 0, oldestPendingHours: 8, needsSignIn: false };
    await reportStuckOutbox(stuck, NOW);
    await reportStuckOutbox(stuck, NOW + 3_600_000);
    expect(messages()).toEqual(["Field work is stuck on the phone"]);

    await reportStuckOutbox(stuck, NOW + 25 * 3_600_000);
    expect(messages()).toHaveLength(2);
  });
});

describe("OutboxMonitor", () => {
  /** A phone with 8-hour-old work that cannot be sent: the server never answers. */
  async function phoneWithOldWork() {
    jest.useFakeTimers({ now: NOW });
    post.mockRejectedValue(new NetworkError("timeout", true));
    await AsyncStorage.setItem("pmd.outbox", JSON.stringify([item("a", hoursAgo(8))]));
    await render(
      <OutboxProvider>
        <OutboxMonitor />
      </OutboxProvider>,
    );
  }

  async function wait(ms: number) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(ms);
    });
  }

  it("reports work that stays queued after the phone has been online for a while", async () => {
    await phoneWithOldWork();
    await wait(ONLINE_FOR_MS - 60_000);
    expect(messages()).toEqual([]); // just back online: give the queue time to empty

    await wait(5 * 60_000);
    expect(messages()).toEqual(["Field work is stuck on the phone"]);
    expect(sentry.captureMessage.mock.calls[0][1]).toMatchObject({
      tags: { needs_sign_in: "false", last_send_error: "TIMEOUT" },
      contexts: { outbox: { pending: 1, oldestPendingHours: 8 } },
    });
  });

  it("does not report work waiting for signal", async () => {
    await phoneWithOldWork();
    await act(async () => emitNetworkChange({ isConnected: false, isInternetReachable: false }));
    await wait(ONLINE_FOR_MS * 3);
    expect(messages()).toEqual([]);

    await act(async () => emitNetworkChange({ isConnected: true, isInternetReachable: true }));
    await wait(ONLINE_FOR_MS + 5 * 60_000);
    expect(messages()).toEqual(["Field work is stuck on the phone"]);
  });
});
