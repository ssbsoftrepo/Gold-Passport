import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { ApiError, NetworkError, postJson, setAccessToken, uploadMultipart } from "../api";
import { fieldEvents, resetFieldLogForTests } from "../fieldLog";
import { OutboxProvider, useOutbox, type OutboxItem } from "../outbox";
import { fakeFiles } from "@/test/fileSystem";
import { emitNetworkChange } from "@/test/netInfo";

jest.mock("../api", () => ({
  ...jest.requireActual("../api"),
  postJson: jest.fn(),
  uploadMultipart: jest.fn(),
}));

const post = postJson as jest.MockedFunction<typeof postJson>;
const upload = uploadMultipart as jest.MockedFunction<typeof uploadMultipart>;

const STORAGE_KEY = "pmd.outbox";
const offline = () => new NetworkError("Network request failed");
const checkpoint = (n: number) => ({ kind: "json" as const, path: `/api/v1/transports/t1/checkpoints`, body: { n } });
const meta = (n: number) => ({ label: `Checkpoint ${n}`, scope: "transport:t1" });

let appStateListener: ((state: AppStateStatus) => void) | undefined;

/** Lets pending promises (storage, requests) settle without moving the clock. */
async function settle() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function renderOutbox() {
  const hook = await renderHook(() => useOutbox(), { wrapper: OutboxProvider });
  await settle(); // the queue saved on the device has loaded
  return hook;
}

async function stored(): Promise<OutboxItem[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
}

/** Bodies of the JSON requests sent, in order, with the idempotency key of each. */
function sentBodies() {
  return post.mock.calls.map(([, body, key]) => ({ body, key }));
}

beforeEach(async () => {
  jest.useFakeTimers();
  post.mockReset();
  upload.mockReset();
  fakeFiles.reset();
  resetFieldLogForTests();
  await AsyncStorage.clear();
  setAccessToken("token");
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove: () => (appStateListener = undefined) };
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("with signal", () => {
  it("sends at once and keeps nothing", async () => {
    post.mockResolvedValue({ id: "c1" });
    const { result } = await renderOutbox();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submit(checkpoint(1), meta(1));
    });

    expect(outcome).toEqual({ status: "sent", result: { id: "c1" } });
    expect(post).toHaveBeenCalledWith("/api/v1/transports/t1/checkpoints", { n: 1 }, expect.any(String));
    expect(result.current.items).toEqual([]);
    expect(await stored()).toEqual([]);
  });

  it("throws a business error at once instead of queuing it", async () => {
    post.mockRejectedValue(new ApiError(422, "VALIDATION", "Latitude out of range"));
    const { result } = await renderOutbox();

    await act(async () => {
      await expect(result.current.submit(checkpoint(1), meta(1))).rejects.toMatchObject({ code: "VALIDATION" });
    });
    expect(result.current.items).toEqual([]);
  });
});

describe("without signal", () => {
  it("keeps the action on the device and sends it when the signal returns", async () => {
    post.mockRejectedValueOnce(offline());
    const { result } = await renderOutbox();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submit(checkpoint(1), meta(1));
    });
    expect(outcome).toEqual({ status: "queued" });
    expect(result.current.items).toEqual([expect.objectContaining({ label: "Checkpoint 1", scope: "transport:t1" })]);
    expect(await stored()).toHaveLength(1);

    post.mockResolvedValue({});
    const synced = jest.fn();
    result.current.onSynced(synced);
    await act(async () => emitNetworkChange({ isConnected: true, isInternetReachable: true }));
    await settle();

    expect(result.current.items).toEqual([]);
    expect(await stored()).toEqual([]);
    expect(synced).toHaveBeenCalled();
  });

  it("replays in the order the work was done, each with the key of its first attempt", async () => {
    post.mockRejectedValueOnce(offline());
    const { result } = await renderOutbox();

    await act(async () => {
      await result.current.submit(checkpoint(1), meta(1));
      await result.current.submit(checkpoint(2), meta(2)); // queued behind 1 without trying first
      await result.current.submit(checkpoint(3), meta(3));
    });
    expect(post).toHaveBeenCalledTimes(1);
    const firstKey = post.mock.calls[0][2];
    const queuedIds = result.current.items.map((i) => i.id);
    expect(queuedIds[0]).toBe(firstKey);

    post.mockResolvedValue({});
    await act(async () => {
      await result.current.syncNow();
    });

    expect(sentBodies().slice(1)).toEqual([
      { body: { n: 1 }, key: queuedIds[0] },
      { body: { n: 2 }, key: queuedIds[1] },
      { body: { n: 3 }, key: queuedIds[2] },
    ]);
    expect(new Set(queuedIds).size).toBe(3);
  });

  it("stops at the first item that still gets no answer, so nothing overtakes it", async () => {
    post.mockRejectedValue(offline());
    const { result } = await renderOutbox();
    await act(async () => {
      await result.current.submit(checkpoint(1), meta(1));
      await result.current.submit(checkpoint(2), meta(2));
    });

    post.mockReset();
    post.mockRejectedValueOnce(new ApiError(503, "HTTP_503", "Service Unavailable")).mockResolvedValue({});
    await act(async () => {
      await result.current.syncNow();
    });

    expect(sentBodies().map((c) => c.body)).toEqual([{ n: 1 }]);
    expect(result.current.items.map((i) => i.label)).toEqual(["Checkpoint 1", "Checkpoint 2"]);
    expect(result.current.items.every((i) => !i.error)).toBe(true);
  });

  it("marks a rejected item as failed and carries on with the rest", async () => {
    post.mockRejectedValue(offline());
    const { result } = await renderOutbox();
    await act(async () => {
      await result.current.submit(checkpoint(1), meta(1));
      await result.current.submit(checkpoint(2), meta(2));
    });

    post.mockReset();
    post.mockRejectedValueOnce(new ApiError(409, "INVALID_STATE", "Transport already delivered")).mockResolvedValue({});
    await act(async () => {
      await result.current.syncNow();
    });

    expect(result.current.items).toEqual([
      expect.objectContaining({ label: "Checkpoint 1", error: "Transport already delivered" }),
    ]);
    expect(sentBodies().map((c) => c.body)).toEqual([{ n: 1 }, { n: 2 }]);

    // A failed item is not retried and does not hold back new work.
    post.mockClear();
    await act(async () => {
      await result.current.submit(checkpoint(3), meta(3));
    });
    expect(sentBodies().map((c) => c.body)).toEqual([{ n: 3 }]);
  });

  it("can discard a failed item", async () => {
    post.mockRejectedValueOnce(offline()).mockRejectedValueOnce(new ApiError(422, "VALIDATION", "Bad"));
    const { result } = await renderOutbox();
    await act(async () => {
      await result.current.submit(checkpoint(1), meta(1));
      await result.current.syncNow();
    });
    expect(result.current.items[0].error).toBe("Bad");

    await act(async () => {
      await result.current.discard(result.current.items[0].id);
    });
    expect(result.current.items).toEqual([]);
    expect(await stored()).toEqual([]);
  });
});

describe("field log", () => {
  it("notes each attempt, how it ended and how long it took", async () => {
    post.mockRejectedValueOnce(new NetworkError("slow", true));
    const { result } = await renderOutbox();
    await act(async () => {
      await result.current.submit(checkpoint(1), meta(1));
    });
    post.mockResolvedValue({});
    await act(async () => {
      await result.current.syncNow();
    });

    expect(fieldEvents()).toEqual([
      expect.objectContaining({ type: "send", path: "/api/v1/transports/t1/checkpoints", replay: false, outcome: "retry", error: "TIMEOUT" }),
      expect.objectContaining({ type: "queued", path: "/api/v1/transports/t1/checkpoints", bytes: null }),
      expect.objectContaining({ type: "send", replay: true, outcome: "sent", error: null, ms: expect.any(Number) }),
    ]);
  });
});

describe("retrying on a weak signal", () => {
  it("tries again after 10 s, then waits twice as long each time", async () => {
    post.mockRejectedValue(offline());
    const { result } = await renderOutbox();
    await act(async () => {
      await result.current.submit(checkpoint(1), meta(1));
    });
    expect(post).toHaveBeenCalledTimes(1);

    await advance(10_000);
    expect(post).toHaveBeenCalledTimes(2);
    await advance(19_999);
    expect(post).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(post).toHaveBeenCalledTimes(3);
    await advance(40_000);
    expect(post).toHaveBeenCalledTimes(4);

    post.mockResolvedValue({});
    await advance(80_000);
    expect(post).toHaveBeenCalledTimes(5);
    expect(result.current.items).toEqual([]);

    // Nothing left: no more attempts.
    await advance(10 * 60_000);
    expect(post).toHaveBeenCalledTimes(5);
  });

  it("never waits more than 5 minutes between attempts", async () => {
    post.mockRejectedValue(offline());
    const { result } = await renderOutbox();
    await act(async () => {
      await result.current.submit(checkpoint(1), meta(1));
    });
    await advance(10_000 + 20_000 + 40_000 + 80_000 + 160_000); // attempts 2-6
    const before = post.mock.calls.length;
    await advance(5 * 60_000);
    expect(post.mock.calls.length).toBe(before + 1);
    await advance(5 * 60_000);
    expect(post.mock.calls.length).toBe(before + 2);
  });

  it("tries at once when the app comes back to the foreground, and restarts the backoff", async () => {
    post.mockRejectedValue(offline());
    const { result } = await renderOutbox();
    await act(async () => {
      await result.current.submit(checkpoint(1), meta(1));
    });
    await advance(10_000 + 20_000); // two failed retries: the next one is 40 s away

    post.mockClear();
    await act(async () => appStateListener?.("active"));
    await settle();
    expect(post).toHaveBeenCalledTimes(1);
    await advance(10_000);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("ignores network events that report no internet", async () => {
    post.mockRejectedValue(offline());
    const { result } = await renderOutbox();
    await act(async () => {
      await result.current.submit(checkpoint(1), meta(1));
    });
    post.mockClear();

    await act(async () => emitNetworkChange({ isConnected: true, isInternetReachable: false }));
    await act(async () => emitNetworkChange({ isConnected: false, isInternetReachable: null }));
    await settle();
    expect(post).not.toHaveBeenCalled();
  });
});

describe("session expired while offline", () => {
  it("pauses the queue until the user signs in again", async () => {
    post.mockRejectedValue(new ApiError(401, "UNAUTHORIZED", "Expired"));
    const { result } = await renderOutbox();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submit(checkpoint(1), meta(1));
    });
    expect(outcome).toEqual({ status: "queued" });
    expect(result.current.needsSignIn).toBe(true);

    // Neither the timer nor new work tries while the session is rejected.
    await act(async () => {
      await result.current.submit(checkpoint(2), meta(2));
    });
    await advance(10 * 60_000);
    await act(async () => {
      await result.current.syncNow();
    });
    expect(post).toHaveBeenCalledTimes(1);

    post.mockReset();
    post.mockResolvedValue({});
    await act(async () => setAccessToken("new-token"));
    await settle();

    expect(result.current.needsSignIn).toBe(false);
    expect(sentBodies().map((c) => c.body)).toEqual([{ n: 1 }, { n: 2 }]);
    expect(result.current.items).toEqual([]);
  });

  it("keeps queued work (not failed) when the session is rejected during a replay", async () => {
    post.mockRejectedValue(offline());
    const { result } = await renderOutbox();
    await act(async () => {
      await result.current.submit(checkpoint(1), meta(1));
      await result.current.submit(checkpoint(2), meta(2));
    });

    post.mockReset();
    post.mockRejectedValue(new ApiError(401, "UNAUTHORIZED", "Expired"));
    await act(async () => {
      await result.current.syncNow();
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(result.current.needsSignIn).toBe(true);
    expect(result.current.items.map((i) => [i.label, i.error])).toEqual([
      ["Checkpoint 1", undefined],
      ["Checkpoint 2", undefined],
    ]);
  });
});

describe("photos", () => {
  const photo = { kind: "upload" as const, path: "/api/v1/lots/l1/evidence", fileUri: "file:///cache/ImagePicker/a.jpg", fileName: "a.jpg", mimeType: "image/jpeg", fields: { kind: "EXTRACTION_PHOTO" } };

  it("keeps its own copy of a queued photo and deletes it once sent", async () => {
    fakeFiles.write(photo.fileUri, 450_000);
    upload.mockRejectedValueOnce(offline());
    const { result } = await renderOutbox();

    await act(async () => {
      await result.current.submit(photo, { label: "Photo", scope: "lot:l1" });
    });
    const queued = result.current.items[0];
    expect(queued.kind === "upload" && queued.fileUri).toBe(`file:///document/outbox/${queued.id}-a.jpg`);
    expect(fakeFiles.has(`file:///document/outbox/${queued.id}-a.jpg`)).toBe(true);

    // The OS may clear the picker's cache while the photo waits; the copy is what gets sent.
    fakeFiles.reset();
    fakeFiles.write(`file:///document/outbox/${queued.id}-a.jpg`, 450_000);

    upload.mockResolvedValue({ fileId: "f1" });
    await act(async () => {
      await result.current.syncNow();
    });
    expect(upload).toHaveBeenLastCalledWith(
      "/api/v1/lots/l1/evidence",
      { uri: `file:///document/outbox/${queued.id}-a.jpg`, name: "a.jpg", type: "image/jpeg" },
      { kind: "EXTRACTION_PHOTO" },
      queued.id,
    );
    expect(result.current.items).toEqual([]);
    expect(fakeFiles.uris()).toEqual([]);
  });

  it("deletes the copy when a queued photo is discarded", async () => {
    fakeFiles.write(photo.fileUri);
    upload.mockRejectedValue(offline());
    const { result } = await renderOutbox();
    await act(async () => {
      await result.current.submit(photo, { label: "Photo", scope: "lot:l1" });
    });

    await act(async () => {
      await result.current.discard(result.current.items[0].id);
    });
    expect(fakeFiles.uris()).toEqual([photo.fileUri]);
  });
});

describe("after a restart", () => {
  it("loads the saved queue and tries to send it", async () => {
    post.mockRejectedValue(offline());
    const first = await renderOutbox();
    await act(async () => {
      await first.result.current.submit(checkpoint(1), meta(1));
    });
    await first.unmount();
    const [saved] = await stored();

    post.mockReset();
    post.mockResolvedValue({});
    const second = await renderOutbox();

    expect(sentBodies()).toEqual([{ body: { n: 1 }, key: saved.id }]);
    expect(second.result.current.items).toEqual([]);
  });

  it("deletes photo copies that no queued item owns", async () => {
    const owned: OutboxItem = {
      kind: "upload",
      id: "keep1",
      path: "/api/v1/lots/l1/evidence",
      fileUri: "file:///document/outbox/keep1-a.jpg",
      fileName: "a.jpg",
      mimeType: "image/jpeg",
      fields: {},
      label: "Photo",
      scope: "lot:l1",
      createdAt: "2026-10-28T06:00:00.000Z",
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([owned]));
    fakeFiles.write("file:///document/outbox/keep1-a.jpg");
    fakeFiles.write("file:///document/outbox/lost9-b.jpg"); // app killed before the queue was saved
    upload.mockRejectedValue(offline());

    const { result } = await renderOutbox();

    expect(result.current.items.map((i) => i.id)).toEqual(["keep1"]);
    expect(fakeFiles.uris()).toEqual(["file:///document/outbox/keep1-a.jpg"]);
  });
});
