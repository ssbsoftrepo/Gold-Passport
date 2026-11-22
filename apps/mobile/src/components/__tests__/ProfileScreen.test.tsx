import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Share } from "react-native";
import { I18nProvider, translate } from "@/lib/i18n";
import { record, resetFieldLogForTests } from "@/lib/fieldLog";
import { ProfileScreen } from "../SharedScreens";

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
jest.mock("@/lib/session", () => ({
  useSession: () => ({ user: { displayName: "Rosa Quispe", phone: "+51987654321", role: "MINER" }, signOut: jest.fn() }),
}));
jest.mock("@/lib/outbox", () => ({
  useOutbox: () => ({
    items: [{ id: "a", kind: "json", path: "/x", body: {}, label: "LOT-1: GPS", scope: "lot:1", createdAt: "2026-10-28T07:00:00.000Z" }],
    syncing: false,
    needsSignIn: false,
    syncNow: jest.fn(),
    discard: jest.fn(),
  }),
}));

// The test runtime reports an English device, so the screen opens in English.
const t = (key: string) => translate("en", key);

it("shares a field report without the user's name or number", async () => {
  resetFieldLogForTests();
  record({ type: "gps", ms: 2_000, accuracyM: 7, lastKnown: false, error: null });
  const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction", activityType: undefined });

  await render(
    <I18nProvider>
      <ProfileScreen />
    </I18nProvider>,
  );
  fireEvent.press(await screen.findByText(t("profile.sendFieldReport")));

  await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
  const message = share.mock.calls[0][0].message ?? "";
  const report = JSON.parse(message);
  expect(report).toMatchObject({ report: "pmd-field-report/1", outbox: { pending: 1 }, summary: { gps: { medianAccuracyM: 7 } } });
  expect(message).not.toContain("Rosa");
  expect(message).not.toContain("987654321");
});
