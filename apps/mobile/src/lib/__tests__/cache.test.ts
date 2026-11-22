import AsyncStorage from "@react-native-async-storage/async-storage";
import { cacheGeneration, clearCache, readCache, writeCache } from "../cache";

beforeEach(async () => {
  await AsyncStorage.clear();
});

const savedAt = "2026-10-28T07:00:00.000Z";

it("returns what a screen saved", async () => {
  await writeCache("lots", [{ id: "l1" }], savedAt, cacheGeneration());
  expect(await readCache("lots")).toEqual({ data: [{ id: "l1" }], savedAt });
});

it("returns nothing for a screen never saved, or unreadable data", async () => {
  expect(await readCache("never")).toBeNull();
  await AsyncStorage.setItem("pmd.cache.broken", "{not json");
  expect(await readCache("broken")).toBeNull();
});

it("keeps only the 40 most recently used screens", async () => {
  const generation = cacheGeneration();
  for (let i = 1; i <= 41; i++) await writeCache(`lot:${i}`, i, savedAt, generation);
  await writeCache("lot:2", "again", savedAt, generation); // used again: now the newest

  expect(await readCache("lot:1")).toBeNull();
  expect(await readCache("lot:2")).toMatchObject({ data: "again" });
  expect(await readCache("lot:41")).toMatchObject({ data: 41 });
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith("pmd.cache."));
  expect(keys).toHaveLength(40);
});

it("forgets everything on sign-out but leaves other app data alone", async () => {
  await AsyncStorage.setItem("pmd.outbox", "[]");
  await writeCache("lots", [1], savedAt, cacheGeneration());
  await clearCache();

  expect(await readCache("lots")).toBeNull();
  expect(await AsyncStorage.getAllKeys()).toEqual(["pmd.outbox"]);
});

it("drops a load that started before sign-out, so one user's data never shows for the next", async () => {
  const before = cacheGeneration();
  await clearCache(); // sign-out while the load was in flight
  await writeCache("lots", ["previous user's lot"], savedAt, before);
  expect(await readCache("lots")).toBeNull();
});

it("does not let one write lose another's index entry when they overlap", async () => {
  const generation = cacheGeneration();
  await Promise.all(Array.from({ length: 10 }, (_, i) => writeCache(`k${i}`, i, savedAt, generation)));
  const index = JSON.parse((await AsyncStorage.getItem("pmd.cache-index")) ?? "[]") as string[];
  expect([...index].sort()).toEqual(Array.from({ length: 10 }, (_, i) => `k${i}`).sort());
});
