import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Last data each screen loaded, kept on the device so screens open with something useful at the
 * mine or on the road, where the signal is weak or absent. Cleared on sign-out.
 *
 * Only the most recently used MAX_ENTRIES screens are kept. AsyncStorage is small on Android (6 MB
 * by default) and the offline outbox lives in it too, so an ever-growing cache of every lot and
 * transport ever opened could make queuing field work fail.
 */

const PREFIX = "pmd.cache.";
/** Most recently written keys first. Outside PREFIX so it is never mistaken for a screen's data. */
const INDEX_KEY = "pmd.cache-index";
const MAX_ENTRIES = 40;

export type Cached<T> = { data: T; savedAt: string };

/**
 * Bumped by clearCache. A load that started before a sign-out may finish after it; its write carries
 * the older generation and is dropped, so one user's data never reappears for the next.
 */
let generation = 0;

export function cacheGeneration(): number {
  return generation;
}

/** Writes and clears are read-modify-write on the index; running them one at a time keeps entries from being lost. */
let queue: Promise<void> = Promise.resolve();

function serialized(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch(() => {
    // A full disk must not break the screen; the data is simply not kept for offline use.
  });
  return queue;
}

async function readIndex(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

export async function readCache<T>(key: string): Promise<Cached<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Cached<T>) : null;
  } catch {
    return null;
  }
}

/** Saves a screen's data, unless the cache was cleared since `startedIn` (see cacheGeneration). */
export function writeCache<T>(key: string, data: T, savedAt: string, startedIn: number): Promise<void> {
  return serialized(async () => {
    if (startedIn !== generation) return;
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ data, savedAt } satisfies Cached<T>));
    const keys = [key, ...(await readIndex()).filter((k) => k !== key)];
    const evicted = keys.slice(MAX_ENTRIES);
    if (evicted.length > 0) await AsyncStorage.multiRemove(evicted.map((k) => PREFIX + k));
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(keys.slice(0, MAX_ENTRIES)));
  });
}

export function clearCache(): Promise<void> {
  generation += 1;
  return serialized(async () => {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX) || k === INDEX_KEY);
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
  });
}
