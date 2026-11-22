import { render, screen } from "@testing-library/react-native";
import { I18nProvider, translate } from "@/lib/i18n";
import MinerHome from "@/app/miner/index";
import Payments from "@/app/miner/payments";
import { ProfileScreen } from "../SharedScreens";

// A store build for the phase 1 release: sign-up and approval only.
jest.mock("@/lib/features", () => {
  const actual = jest.requireActual("@/lib/features");
  return { ...actual, isEnabled: (feature: string) => actual.isEnabled(feature, 1) };
});
jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock("@/lib/session", () => ({
  useSession: () => ({ user: { displayName: "Rosa Quispe", phone: "+51987654321", role: "MINER" }, signOut: jest.fn() }),
}));
jest.mock("@/lib/outbox", () => ({
  useOutbox: () => ({ items: [], syncing: false, needsSignIn: false, syncNow: jest.fn(), discard: jest.fn() }),
}));

// Spanish only until English is released, whatever the device's language.
const t = (key: string) => translate("es", key);

async function show(ui: React.ReactElement) {
  await render(<I18nProvider>{ui}</I18nProvider>);
}

it("tells an approved miner that batches are coming, in Spanish", async () => {
  await show(<MinerHome />);
  expect(await screen.findByText(t("soon.title"))).toBeTruthy();
  expect(screen.getByText(t("soon.body"))).toBeTruthy();
  expect(screen.queryByText(t("lots.new"))).toBeNull();
});

it("keeps a later phase's screen closed even if a link leads there", async () => {
  await show(<Payments />);
  expect(await screen.findByText(t("soon.notYet"))).toBeTruthy();
});

it("leaves the profile without language choice, pending uploads or field report", async () => {
  await show(<ProfileScreen />);
  expect(await screen.findByText("Rosa Quispe")).toBeTruthy();
  for (const key of ["profile.language", "profile.outbox", "profile.fieldReport"]) {
    expect(screen.queryByText(t(key))).toBeNull();
  }
});
