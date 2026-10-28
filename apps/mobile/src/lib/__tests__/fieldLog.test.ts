import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError, NetworkError } from "../api";
import {
  MAX_EVENTS,
  errorName,
  fieldEvents,
  fieldReport,
  loadFieldLog,
  pathPattern,
  record,
  resetFieldLogForTests,
  sendOutcome,
  startFieldLog,
  summarize,
  type FieldEvent,
} from "../fieldLog";
import { emitNetworkChange } from "@/test/netInfo";

beforeEach(async () => {
  jest.useFakeTimers();
  resetFieldLogForTests();
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

const at = "2026-10-28T08:00:00.000Z";
const send = (outcome: "sent" | "retry" | "failed" | "signin", ms: number, extra: Partial<FieldEvent> = {}): FieldEvent =>
  ({ type: "send", at, path: "/api/v1/lots/:id/photos", replay: false, outcome, ms, bytes: null, error: null, ...extra }) as FieldEvent;

describe("what is recorded", () => {
  it("reduces paths to their pattern, so no ids or query strings are kept", () => {
    expect(pathPattern("/api/v1/lots/5bd345da-8e7f-4b1c-9d2a-0123456789ab/photos?x=1")).toBe("/api/v1/lots/:id/photos");
    expect(
      pathPattern("/api/v1/transports/5BD345DA-8E7F-4B1C-9D2A-0123456789AB/checkpoints/5bd345da-8e7f-4b1c-9d2a-0123456789ab"),
    ).toBe("/api/v1/transports/:id/checkpoints/:id");
  });

  it.each([
    [new NetworkError("slow", true), "TIMEOUT", "retry"],
    [new NetworkError("offline"), "NO_ANSWER", "retry"],
    [new ApiError(503, "HTTP_503", "x"), "HTTP_503", "retry"],
    [new ApiError(401, "UNAUTHORIZED", "x"), "UNAUTHORIZED", "signin"],
    [new ApiError(422, "VALIDATION", "Bad latitude for +51987654321"), "VALIDATION", "failed"],
    [new TypeError("x"), "TypeError", "retry"],
  ])("names %p as %s (%s), never by its message", (error, name, outcome) => {
    expect(errorName(error)).toBe(name);
    expect(sendOutcome(error)).toBe(outcome);
  });
});

describe("keeping the log", () => {
  it("keeps only the last events", () => {
    for (let i = 0; i < MAX_EVENTS + 5; i++) record({ type: "queued", path: `/p${i}`, bytes: null });
    const events = fieldEvents();
    expect(events).toHaveLength(MAX_EVENTS);
    expect(events[0]).toMatchObject({ path: "/p5" });
  });

  it("saves in batches and loads the saved events after a restart, before the new ones", async () => {
    record({ type: "queued", path: "/before", bytes: null });
    expect(await AsyncStorage.getItem("pmd.field-log")).toBeNull(); // not on the request path
    await jest.advanceTimersByTimeAsync(3_000);

    resetFieldLogForTests(); // app restarted
    record({ type: "queued", path: "/after", bytes: null });
    await loadFieldLog();
    expect(fieldEvents().map((e) => e.type === "queued" && e.path)).toEqual(["/before", "/after"]);
  });

  it("records signal changes once each, and app starts", async () => {
    const stop = startFieldLog();
    const cellular = { isConnected: true, isInternetReachable: true, type: "cellular", details: { cellularGeneration: "3g" } };
    emitNetworkChange(cellular as never);
    emitNetworkChange(cellular as never);
    emitNetworkChange({ isConnected: false, isInternetReachable: false, type: "none", details: null } as never);
    stop();
    emitNetworkChange(cellular as never);

    expect(fieldEvents().map((e) => (e.type === "network" ? `${e.kind}/${e.generation}` : e.type))).toEqual([
      "app",
      "cellular/3g",
      "none/null",
    ]);
  });
});

describe("summary", () => {
  it("adds up what a field trial checks", () => {
    const events: FieldEvent[] = [
      { type: "network", at, connected: false, reachable: false, kind: "none", generation: null },
      { type: "queued", at, path: "/p", bytes: 400_000 },
      send("retry", 20_000, { error: "TIMEOUT" }),
      send("retry", 1_000, { error: "NO_ANSWER" }),
      { type: "network", at, connected: true, reachable: true, kind: "cellular", generation: "3g" },
      send("sent", 8_000, { bytes: 409_600 }), // 50 KB/s
      send("sent", 2_000, { bytes: 409_600 }), // 200 KB/s
      send("failed", 300, { error: "VALIDATION" }),
      { type: "gps", at, ms: 4_000, accuracyM: 8, lastKnown: false, error: null },
      { type: "gps", at, ms: 30_000, accuracyM: 65, lastKnown: true, error: null },
      { type: "gps", at, ms: 1_000, accuracyM: null, lastKnown: false, error: "LOCATION_DENIED" },
    ];

    expect(summarize(events)).toEqual({
      from: at,
      to: at,
      sends: {
        attempts: 5,
        outcomes: { retry: 2, sent: 2, failed: 1 },
        errors: { TIMEOUT: 1, NO_ANSWER: 1, VALIDATION: 1 },
        medianMs: 2_000,
        medianUploadKBps: 125,
      },
      queued: 1,
      network: { changes: 2, offlineChanges: 1, kinds: { none: 1, "cellular/3g": 1 } },
      gps: {
        readings: 3,
        failures: 1,
        lastKnownFallbacks: 1,
        medianAccuracyM: 37,
        worstAccuracyM: 65,
        medianFixMs: 17_000,
      },
    });
  });

  it("copes with an empty log", () => {
    expect(summarize([])).toMatchObject({ from: null, sends: { attempts: 0, medianMs: null }, gps: { medianAccuracyM: null } });
  });
});

describe("report", () => {
  it("describes the phone and the outbox without personal data", async () => {
    record({ type: "gps", ms: 3_000, accuracyM: 12, lastKnown: false, error: null });
    const report = await fieldReport([
      { id: "a", createdAt: "2026-10-28T07:00:00.000Z" },
      { id: "b", createdAt: "2026-10-28T07:05:00.000Z", error: "Transport already delivered to Rosa Quispe" },
    ]);

    expect(report).toMatchObject({
      report: "pmd-field-report/1",
      outbox: { pending: 1, failed: 1, oldestPendingAt: "2026-10-28T07:00:00.000Z" },
      summary: { gps: { readings: 1, medianAccuracyM: 12 } },
    });
    expect(report.app.server).toBe("localhost:8080");
    expect(report.device).toHaveProperty("model");
    expect(JSON.stringify(report)).not.toContain("Rosa Quispe"); // server messages may name people
  });
});
