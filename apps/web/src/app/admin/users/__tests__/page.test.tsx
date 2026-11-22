import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider, translate } from "@/lib/i18n";
import { json, requestsTo, route } from "@/test/server";
import AdminUsers from "../page";

vi.mock("@/lib/session", async (original) => ({
  ...(await original<typeof import("@/lib/session")>()),
  useSession: () => ({ status: "authenticated", user: { id: "me", role: "ADMIN", phone: "+51900000001" } }),
}));

const t = (key: string) => translate("es", key);
const person = (id: string, role: string | null, displayName: string) => ({
  id, role, displayName, phone: `+5190000000${id.length}`, email: null, locale: "es", createdAt: "2026-11-01T00:00:00Z",
});

async function usersPage() {
  route("GET /api/v1/admin/users", [person("me", "ADMIN", "Lucía (PMD)"), person("ana", "MINER", "Ana Quispe"), person("staff", "ADMIN", "Jorge (PMD)")]);
  render(
    <I18nProvider>
      <AdminUsers />
    </I18nProvider>,
  );
  return screen.findByText("Ana Quispe");
}

const row = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

afterEach(() => vi.restoreAllMocks());

it("offers a PIN reset for others, a password reset for staff and nothing for oneself", async () => {
  await usersPage();
  expect(within(row("Ana Quispe")).getByRole("button", { name: t("admin.users.resetPin") })).toBeVisible();
  expect(within(row("Jorge (PMD)")).getByRole("button", { name: t("admin.users.resetPassword") })).toBeVisible();
  expect(within(row("Lucía (PMD)")).queryByRole("button")).toBeNull();
});

it("shows the temporary PIN once after PMD confirms", async () => {
  route("POST /api/v1/admin/users/ana/reset-pin", { temporaryPin: "902741", expiresAt: "2026-11-29T10:00:00Z" });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  await usersPage();

  await userEvent.click(within(row("Ana Quispe")).getByRole("button", { name: t("admin.users.resetPin") }));

  expect(confirm).toHaveBeenCalled();
  expect(await screen.findByText("902741")).toBeVisible();
  expect(requestsTo("POST /api/v1/admin/users/ana/reset-pin")).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: t("admin.users.resetDone") }));
  expect(screen.queryByText("902741")).toBeNull();
});

it("does nothing when PMD cancels", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  await usersPage();

  await userEvent.click(within(row("Ana Quispe")).getByRole("button", { name: t("admin.users.resetPin") }));

  expect(requestsTo("POST /api/v1/admin/users/ana/reset-pin")).toHaveLength(0);
});

it("explains a person who has no sign-in yet", async () => {
  route("POST /api/v1/admin/users/ana/reset-pin", () => json(409, { code: "NO_ACCOUNT_YET", title: "Conflict" }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  await usersPage();

  await userEvent.click(within(row("Ana Quispe")).getByRole("button", { name: t("admin.users.resetPin") }));

  expect(await screen.findByRole("alert")).toHaveTextContent(t("errors.NO_ACCOUNT_YET"));
});
