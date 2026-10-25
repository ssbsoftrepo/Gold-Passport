import * as Location from "expo-location";

export type Reading = { latitude: number; longitude: number; accuracyMeters: number | null; recordedAt: string };

/**
 * Current GPS reading. GPS works without mobile data, so this succeeds offline; the reading is
 * timestamped on the device and synced later by the outbox.
 */
export async function currentReading(): Promise<Reading> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    throw Object.assign(new Error("Location permission denied"), { code: "LOCATION_DENIED" });
  }
  let position: Location.LocationObject | null = null;
  try {
    position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  } catch {
    position = await Location.getLastKnownPositionAsync();
  }
  if (!position) {
    throw Object.assign(new Error("No GPS fix"), { code: "LOCATION_UNAVAILABLE" });
  }
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: position.coords.accuracy ?? null,
    recordedAt: new Date(position.timestamp).toISOString(),
  };
}
