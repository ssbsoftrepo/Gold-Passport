import * as Location from "expo-location";
import { record } from "./fieldLog";

export type Reading = { latitude: number; longitude: number; accuracyMeters: number | null; recordedAt: string };

/**
 * Current GPS reading. GPS works without mobile data, so this succeeds offline; the reading is
 * timestamped on the device and synced later by the outbox.
 */
export async function currentReading(): Promise<Reading> {
  const started = Date.now();
  try {
    const { reading, lastKnown } = await read();
    record({ type: "gps", ms: Date.now() - started, accuracyM: reading.accuracyMeters, lastKnown, error: null });
    return reading;
  } catch (e) {
    const code = (e as { code?: string }).code ?? "LOCATION_ERROR";
    record({ type: "gps", ms: Date.now() - started, accuracyM: null, lastKnown: false, error: code });
    throw e;
  }
}

async function read(): Promise<{ reading: Reading; lastKnown: boolean }> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    throw Object.assign(new Error("Location permission denied"), { code: "LOCATION_DENIED" });
  }
  let position: Location.LocationObject | null = null;
  let lastKnown = false;
  try {
    position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  } catch {
    position = await Location.getLastKnownPositionAsync();
    lastKnown = true;
  }
  if (!position) {
    throw Object.assign(new Error("No GPS fix"), { code: "LOCATION_UNAVAILABLE" });
  }
  const reading: Reading = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: position.coords.accuracy ?? null,
    recordedAt: new Date(position.timestamp).toISOString(),
  };
  return { reading, lastKnown };
}
