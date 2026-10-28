import * as Location from "expo-location";
import { fieldEvents, resetFieldLogForTests } from "../fieldLog";
import { currentReading } from "../location";

jest.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
}));

const mocked = Location as jest.Mocked<typeof Location>;
const position = (accuracy: number | null) =>
  ({ coords: { latitude: -14.8312, longitude: -70.1, accuracy }, timestamp: Date.parse("2026-10-28T07:00:00Z") }) as Location.LocationObject;

beforeEach(() => {
  jest.resetAllMocks();
  resetFieldLogForTests();
  mocked.requestForegroundPermissionsAsync.mockResolvedValue({ status: "granted" } as never);
});

it("returns only the reading the API expects, and logs its accuracy but not where it was", async () => {
  mocked.getCurrentPositionAsync.mockResolvedValue(position(9));

  const reading = await currentReading();

  expect(reading).toEqual({ latitude: -14.8312, longitude: -70.1, accuracyMeters: 9, recordedAt: "2026-10-28T07:00:00.000Z" });
  expect(fieldEvents()).toEqual([expect.objectContaining({ type: "gps", accuracyM: 9, lastKnown: false, error: null })]);
  expect(JSON.stringify(fieldEvents())).not.toContain("-14.83");
});

it("falls back to the last known position when no fresh fix comes, and says so in the log", async () => {
  mocked.getCurrentPositionAsync.mockRejectedValue(new Error("timeout"));
  mocked.getLastKnownPositionAsync.mockResolvedValue(position(120));

  await expect(currentReading()).resolves.toMatchObject({ accuracyMeters: 120 });
  expect(fieldEvents()).toEqual([expect.objectContaining({ accuracyM: 120, lastKnown: true })]);
});

it("logs why there was no reading", async () => {
  mocked.requestForegroundPermissionsAsync.mockResolvedValue({ status: "denied" } as never);
  await expect(currentReading()).rejects.toMatchObject({ code: "LOCATION_DENIED" });

  mocked.requestForegroundPermissionsAsync.mockResolvedValue({ status: "granted" } as never);
  mocked.getCurrentPositionAsync.mockRejectedValue(new Error("timeout"));
  mocked.getLastKnownPositionAsync.mockResolvedValue(null);
  await expect(currentReading()).rejects.toMatchObject({ code: "LOCATION_UNAVAILABLE" });

  expect(fieldEvents().map((e) => e.type === "gps" && e.error)).toEqual(["LOCATION_DENIED", "LOCATION_UNAVAILABLE"]);
});
