import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { I18nProvider, translate } from "@/lib/i18n";
import { json, requestsTo, route } from "@/test/server";
import { ChangeSecret } from "../ChangeSecret";

const session = vi.hoisted(() => ({ role: "COLLECTOR" }));
vi.mock("@/lib/session", async (original) => ({
  ...(await original<typeof import("@/lib/session")>()),
  useSession: () => ({ status: "authenticated", user: { id: "u1", role: session.role, phone: "+51900000002" } }),
}));

const t = (key: string) => translate("es", key);

async function change(role: string, labels: [string, string], current: string, next: string) {
  session.role = role;
  route("GET /api/v1/auth/config", { mode: "local" });
  render(
    <I18nProvider>
      <ChangeSecret />
    </I18nProvider>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(t(labels[0])), current);
  await user.type(screen.getByLabelText(t(labels[1])), next);
  await user.type(screen.getByLabelText(t(labels[1] === "login.choosePin" ? "login.confirmPin" : "login.confirmPassword")), next);
  await waitFor(() => expect(screen.getByRole("button", { name: t("common.save") })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: t("common.save") }));
}

it("changes the PIN after confirming the current one", async () => {
  route("PUT /api/v1/me/pin", () => new Response(null, { status: 204 }));
  await change("COLLECTOR", ["account.currentPin", "login.choosePin"], "135790", "246813");

  expect(await screen.findByRole("status")).toHaveTextContent(t("account.pinChanged"));
  expect(await requestsTo("PUT /api/v1/me/pin")[0].json()).toEqual({ currentPin: "135790", newPin: "246813" });
});

it("shows a wrong current PIN", async () => {
  route("PUT /api/v1/me/pin", () => json(401, { code: "INVALID_CREDENTIALS", title: "Unauthorized" }));
  await change("COLLECTOR", ["account.currentPin", "login.choosePin"], "111112", "246813");

  expect(await screen.findByRole("alert")).toHaveTextContent(t("errors.INVALID_CREDENTIALS"));
});

it("asks PMD staff for a password of 10 or more characters", async () => {
  await change("ADMIN", ["account.currentPassword", "login.choosePassword"], "pmd-demo-2026", "short");

  expect(await screen.findByRole("alert")).toHaveTextContent(t("errors.PASSWORD_TOO_SHORT"));
  expect(requestsTo("PUT /api/v1/me/pin")).toHaveLength(0);
});
