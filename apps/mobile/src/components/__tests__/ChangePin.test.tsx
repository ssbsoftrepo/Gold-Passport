import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { I18nProvider, translate } from "@/lib/i18n";
import { ChangePin } from "../ChangePin";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  api: { GET: jest.fn(), PUT: jest.fn() },
  call: async (request: Promise<{ data: unknown }>) => (await request).data,
}));
const mockApi = (jest.requireMock("@/lib/api") as { api: Record<"GET" | "PUT", jest.Mock> }).api;
const t = (key: string) => translate("en", key);
const field = (label: string) => screen.getByLabelText(label);

it("changes the PIN after confirming the current one", async () => {
  mockApi.GET.mockResolvedValue({ data: { mode: "local" } });
  mockApi.PUT.mockResolvedValue({ data: null });
  await render(<I18nProvider><ChangePin phone="+51987650011" /></I18nProvider>);
  await fireEvent.press(screen.getByText(t("pin.change")));
  await fireEvent.changeText(field(t("pin.current")), "482915");
  await fireEvent.changeText(field(t("login.choosePin")), "591824");
  await fireEvent.changeText(field(t("login.confirmPin")), "591824");
  await fireEvent.press(screen.getByText(t("login.savePin")));
  expect(await screen.findByText(t("pin.changed"))).toBeTruthy();
  await waitFor(() =>
    expect(mockApi.PUT).toHaveBeenCalledWith("/api/v1/me/pin", { body: { currentPin: "482915", newPin: "591824" } }));
});
