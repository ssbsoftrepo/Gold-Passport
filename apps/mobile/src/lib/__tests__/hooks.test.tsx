import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook } from "@testing-library/react-native";
import { cacheGeneration, readCache, writeCache } from "../cache";
import { useScreenData } from "../hooks";

jest.mock("expo-router", () => ({
  // Screens load when they gain focus; in a test the screen is focused once, on mount.
  useFocusEffect: (effect: () => void) => jest.requireActual<typeof import("react")>("react").useEffect(effect, [effect]),
}));

const mockSyncedListeners = new Set<() => void>();
jest.mock("../outbox", () => ({
  useOutbox: () => ({
    onSynced: (listener: () => void) => {
      mockSyncedListeners.add(listener);
      return () => mockSyncedListeners.delete(listener);
    },
  }),
}));

/** A promise the test resolves or rejects when it wants, like a request on a slow signal. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(async () => {
  mockSyncedListeners.clear();
  await AsyncStorage.clear();
});

it("shows what it loads and saves it for offline use", async () => {
  const { result } = await renderHook(() => useScreenData(async () => ["lot 1"], "lots"));
  await flush();

  expect(result.current.data).toEqual(["lot 1"]);
  expect(result.current.error).toBeNull();
  expect(result.current.staleSince).toBeNull();
  expect((await readCache("lots"))?.data).toEqual(["lot 1"]);
});

it("shows saved data at once while fresh data loads, then the fresh data", async () => {
  await writeCache("lots", ["saved lot"], "2026-10-27T18:00:00.000Z", cacheGeneration());
  const fresh = deferred<string[]>();
  const { result } = await renderHook(() => useScreenData(() => fresh.promise, "lots"));
  await flush();
  expect(result.current.data).toEqual(["saved lot"]);
  expect(result.current.loading).toBe(true);

  await act(async () => fresh.resolve(["fresh lot"]));
  await flush();
  expect(result.current.data).toEqual(["fresh lot"]);
  expect(result.current.loading).toBe(false);
});

it("keeps showing saved data without signal and says since when", async () => {
  await writeCache("lots", ["saved lot"], "2026-10-27T18:00:00.000Z", cacheGeneration());
  const { result } = await renderHook(() =>
    useScreenData(async () => {
      throw new TypeError("Network request failed");
    }, "lots"),
  );
  await flush();

  expect(result.current.data).toEqual(["saved lot"]);
  expect(result.current.error).toBeInstanceOf(TypeError);
  expect(result.current.staleSince).toBe("2026-10-27T18:00:00.000Z");
});

it("ignores an older reload that answers after a newer one", async () => {
  const answers = [deferred<string>(), deferred<string>()];
  let call = 0;
  const { result } = await renderHook(() => useScreenData(() => answers[call++].promise));
  await flush();

  await act(async () => {
    void result.current.reload(); // e.g. pull to refresh while the first load hangs
  });
  await act(async () => answers[1].resolve("newer"));
  await flush();
  await act(async () => answers[0].resolve("older"));
  await flush();

  expect(result.current.data).toBe("newer");
  expect(result.current.loading).toBe(false);
});

it("lets an action's result win over a reload still in flight", async () => {
  const slow = deferred<string>();
  const { result } = await renderHook(() => useScreenData(() => slow.promise));
  await flush();

  await act(async () => result.current.setData("after action"));
  await act(async () => slow.resolve("before action"));
  await flush();
  expect(result.current.data).toBe("after action");
});

it("reloads after the outbox has sent queued work", async () => {
  let version = 0;
  const { result } = await renderHook(() => useScreenData(async () => ++version));
  await flush();
  expect(result.current.data).toBe(1);

  await act(async () => mockSyncedListeners.forEach((l) => l()));
  await flush();
  expect(result.current.data).toBe(2);
});
