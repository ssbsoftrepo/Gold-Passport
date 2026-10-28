import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Last data each screen loaded, kept on the device so screens open with something useful at the
 * mine or on the road, where the signal is weak or absent. Cleared on sign-out.
 */

const PREFIX = "pmd.cache.";

export type Cached<T> = { data: T; savedAt: string };

export async function readCache<T>(key: string): Promise<Cached<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Cached<T>) : null;
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, data: T, savedAt: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ data, savedAt } satisfies Cached<T>));
  } catch {
    // A full disk must not break the screen; the data is simply not kept for offline use.
  }
}

export async function clearCache(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
  } catch {
    // ignore
  }
}
