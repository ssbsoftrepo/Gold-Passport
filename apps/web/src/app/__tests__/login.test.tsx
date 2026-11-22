import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { I18nProvider, translate } from "@/lib/i18n";
import { json, requestsTo, route } from "@/test/server";
import LoginPage from "../login/page";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
const session = vi.hoisted(() => ({ signIn: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: nav.replace, push: vi.fn() }) }));
vi.mock("@/lib/session", async (original) => ({
  ...(await original<typeof import("@/lib/session")>()),
  useSession: () => ({ status: "anonymous", user: null, signIn: session.signIn, signOut: vi.fn() }),
}));

const t = (key: string) => translate("es", key);
const profile = (role: string | null) => ({ id: "u1", phone: "+51900000002", email: null, displayName: null, role, locale: "es", createdAt: "2026-11-01T00:00:00Z" });

function page() {
  route("GET /api/v1/auth/config", { mode: "local" });
  render(
    <I18nProvider>
      <LoginPage />
    </I18nProvider>,
  );
}

async function signInWith(phone: string, secret: string) {
  const user = userEvent.setup();
  const phoneInput = screen.getByLabelText(t("login.phone"));
  await user.clear(phoneInput);
  await user.type(phoneInput, phone);
  await user.type(screen.getByLabelText(t("login.pin")), secret);
  await waitFor(() => expect(screen.getByRole("button", { name: t("login.signIn") })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: t("login.signIn") }));
  return user;
}

beforeEach(() => {
  nav.replace.mockReset();
  session.signIn.mockReset();
  session.signIn.mockImplementation(async () => profile("COLLECTOR"));
});

it("signs in with phone number and PIN", async () => {
  route("POST /api/v1/auth/pin/sign-in", { accessToken: "tok", expiresIn: 3600 });
  route("GET /api/v1/me", profile("COLLECTOR"));
  page();

  await signInWith("+51 900 000 002", "135790");

  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/collector"));
  expect(session.signIn).toHaveBeenCalledWith("tok");
  expect(await requestsTo("POST /api/v1/auth/pin/sign-in")[0].json()).toEqual({ phone: "+51900000002", pin: "135790" });
});

it("shows a wrong PIN without signing in", async () => {
  route("POST /api/v1/auth/pin/sign-in", () => json(401, { code: "INVALID_CREDENTIALS", title: "Unauthorized" }));
  page();

  await signInWith("+51900000002", "111112");

  expect(await screen.findByRole("alert")).toHaveTextContent(t("errors.INVALID_CREDENTIALS"));
  expect(session.signIn).not.toHaveBeenCalled();
});

it("replaces a temporary PIN from a PMD reset", async () => {
  route("POST /api/v1/auth/pin/sign-in", () => json(409, { code: "PIN_CHANGE_REQUIRED", title: "Conflict" }));
  route("POST /api/v1/auth/pin/new", { accessToken: "tok", expiresIn: 3600 });
  route("GET /api/v1/me", profile("COLLECTOR"));
  page();

  const user = await signInWith("+51900000002", "902741");
  expect(await screen.findByRole("heading", { name: t("login.newPinTitle") })).toBeVisible();

  await user.type(screen.getByLabelText(t("login.choosePin")), "123456");
  await user.type(screen.getByLabelText(t("login.confirmPin")), "123456");
  await user.click(screen.getByRole("button", { name: t("login.savePin") }));
  expect(await screen.findByRole("alert")).toHaveTextContent(t("errors.PIN_NOT_ALLOWED"));
  expect(requestsTo("POST /api/v1/auth/pin/new")).toHaveLength(0);

  await user.clear(screen.getByLabelText(t("login.choosePin")));
  await user.clear(screen.getByLabelText(t("login.confirmPin")));
  await user.type(screen.getByLabelText(t("login.choosePin")), "135790");
  await user.type(screen.getByLabelText(t("login.confirmPin")), "135790");
  await user.click(screen.getByRole("button", { name: t("login.savePin") }));

  await waitFor(() => expect(session.signIn).toHaveBeenCalledWith("tok"));
  expect(await requestsTo("POST /api/v1/auth/pin/new")[0].json()).toEqual({
    phone: "+51900000002",
    temporaryPin: "902741",
    newPin: "135790",
  });
});

it("makes PMD staff with a short PIN choose a longer password first", async () => {
  route("POST /api/v1/auth/pin/sign-in", { accessToken: "staff-tok", expiresIn: 3600 });
  route("GET /api/v1/me", profile("ADMIN"));
  route("PUT /api/v1/me/pin", () => new Response(null, { status: 204 }));
  session.signIn.mockImplementation(async () => profile("ADMIN"));
  page();

  const user = await signInWith("+51900000001", "135790");
  expect(await screen.findByRole("heading", { name: t("login.staffPasswordTitle") })).toBeVisible();
  expect(session.signIn).not.toHaveBeenCalled();

  await user.type(screen.getByLabelText(t("login.choosePassword")), "short");
  await user.type(screen.getByLabelText(t("login.confirmPassword")), "short");
  await user.click(screen.getByRole("button", { name: t("login.savePassword") }));
  expect(await screen.findByRole("alert")).toHaveTextContent(t("errors.PASSWORD_TOO_SHORT"));

  await user.clear(screen.getByLabelText(t("login.choosePassword")));
  await user.clear(screen.getByLabelText(t("login.confirmPassword")));
  await user.type(screen.getByLabelText(t("login.choosePassword")), "oro trazable 2026");
  await user.type(screen.getByLabelText(t("login.confirmPassword")), "oro trazable 2026");
  await user.click(screen.getByRole("button", { name: t("login.savePassword") }));

  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/admin"));
  const change = requestsTo("PUT /api/v1/me/pin")[0];
  expect(change.headers.get("Authorization")).toBe("Bearer staff-tok");
  expect(await change.json()).toEqual({ currentPin: "135790", newPin: "oro trazable 2026" });
  expect(session.signIn).toHaveBeenCalledWith("staff-tok");
});

it("lets a plant create its account with a PIN", async () => {
  route("POST /api/v1/auth/pin/sign-up", () => json(201, { accessToken: "new-tok", expiresIn: 3600 }));
  route("GET /api/v1/me", profile(null));
  session.signIn.mockImplementation(async () => profile(null));
  page();
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: t("login.createAccount") }));
  const phoneInput = screen.getByLabelText(t("login.phone"));
  await user.clear(phoneInput);
  await user.type(phoneInput, "+51900000009");
  await user.type(screen.getByLabelText(t("login.choosePin")), "246813");
  await user.type(screen.getByLabelText(t("login.confirmPin")), "246813");
  await user.click(screen.getByRole("button", { name: t("login.createAccount") }));

  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/onboarding"));
  expect(await requestsTo("POST /api/v1/auth/pin/sign-up")[0].json()).toEqual({ phone: "+51900000009", pin: "246813" });
});
