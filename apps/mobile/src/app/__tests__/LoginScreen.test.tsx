import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { I18nProvider, translate } from "@/lib/i18n";
import Login from "../login";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  api: { GET: jest.fn(), POST: jest.fn(), PUT: jest.fn() },
  call: async (request: Promise<{ data: unknown; error?: { code: string } }>) => {
    const { data, error } = await request;
    if (error) throw Object.assign(new Error(error.code), { code: error.code });
    return data;
  },
}));
const mockSignIn = jest.fn();
jest.mock("@/lib/session", () => ({ useSession: () => ({ signIn: mockSignIn }) }));

const mockApi = (jest.requireMock("@/lib/api") as { api: Record<"GET" | "POST" | "PUT", jest.Mock> }).api;
const t = (key: string) => translate("en", key);
const ok = (data: unknown) => Promise.resolve({ data, response: { ok: true } });
const fail = (code: string) => Promise.resolve({ error: { code }, response: { ok: false } });

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.GET.mockReturnValue(ok({ mode: "local" }));
});

const show = () => render(<I18nProvider><Login /></I18nProvider>);
const field = (label: string) => screen.getByLabelText(label);

it("signs in with the phone number and PIN, and never asks for an SMS code", async () => {
  mockApi.POST.mockReturnValue(ok({ accessToken: "tok" }));
  await show();
  await fireEvent.changeText(field(t("login.phone")), "+51 987 650 011");
  await fireEvent.changeText(field(t("login.pin")), "482915");
  await fireEvent.press(screen.getByText(t("login.signIn")));
  await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith("tok", undefined));
  expect(mockApi.POST).toHaveBeenCalledWith("/api/v1/auth/pin/sign-in", { body: { phone: "+51987650011", pin: "482915" } });
  expect(screen.queryByText(/SMS/)).toBeNull();
});

it("creates an account only with a PIN that follows the rules, typed twice", async () => {
  mockApi.POST.mockReturnValue(ok({ accessToken: "tok" }));
  await show();
  await fireEvent.press(screen.getByText(t("login.createAccount")));
  await fireEvent.changeText(field(t("login.phone")), "+51987650011");
  await fireEvent.changeText(field(t("login.choosePin")), "123456");
  await fireEvent.changeText(field(t("login.confirmPin")), "123456");
  await fireEvent.press(screen.getAllByText(t("login.createAccount")).at(-1)!);
  expect(await screen.findByText(translate("en", "errors.PIN_NOT_ALLOWED"))).toBeTruthy();

  await fireEvent.changeText(field(t("login.choosePin")), "482915");
  await fireEvent.changeText(field(t("login.confirmPin")), "482916");
  await fireEvent.press(screen.getAllByText(t("login.createAccount")).at(-1)!);
  expect(await screen.findByText(translate("en", "errors.PIN_MISMATCH"))).toBeTruthy();
  expect(mockApi.POST).not.toHaveBeenCalled();

  await fireEvent.changeText(field(t("login.confirmPin")), "482915");
  await fireEvent.press(screen.getAllByText(t("login.createAccount")).at(-1)!);
  await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith("tok", undefined));
  expect(mockApi.POST).toHaveBeenCalledWith("/api/v1/auth/pin/sign-up", { body: { phone: "+51987650011", pin: "482915" } });
});

it("after a PMD reset, asks for a new PIN in place of the temporary one", async () => {
  mockApi.POST.mockImplementation((path: string) =>
    path === "/api/v1/auth/pin/sign-in" ? fail("PIN_CHANGE_REQUIRED") : ok({ accessToken: "tok" }));
  await show();
  await fireEvent.changeText(field(t("login.phone")), "+51987650011");
  await fireEvent.changeText(field(t("login.pin")), "730164");
  await fireEvent.press(screen.getByText(t("login.signIn")));
  expect(await screen.findByText(t("login.newPinBody"))).toBeTruthy();

  await fireEvent.changeText(field(t("login.choosePin")), "591824");
  await fireEvent.changeText(field(t("login.confirmPin")), "591824");
  await fireEvent.press(screen.getByText(t("login.savePin")));
  await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith("tok", undefined));
  expect(mockApi.POST).toHaveBeenCalledWith("/api/v1/auth/pin/new", {
    body: { phone: "+51987650011", temporaryPin: "730164", newPin: "591824" },
  });
});
