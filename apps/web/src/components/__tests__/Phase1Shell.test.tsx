import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { I18nProvider, translate } from "@/lib/i18n";
import { route } from "@/test/server";
import { AppShell } from "../AppShell";

const nav = vi.hoisted(() => ({ pathname: "/admin", replace: vi.fn() }));
const session = vi.hoisted(() => ({ role: "ADMIN" as "ADMIN" | "COLLECTOR" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/session", async (original) => ({
  ...(await original<typeof import("@/lib/session")>()),
  useSession: () => ({
    status: "authenticated",
    user: { role: session.role, displayName: "Ana", phone: "+51900000001" },
    signOut: vi.fn(),
  }),
}));
// A build for the phase 1 release: sign-up and approval only.
vi.mock("@/lib/features", async (original) => {
  const actual = await original<typeof import("@/lib/features")>();
  return { ...actual, isEnabled: (feature: Parameters<typeof actual.isEnabled>[0]) => actual.isEnabled(feature, 1) };
});

const t = (key: string) => translate("es", key);

function shell(role: "ADMIN" | "COLLECTOR", pathname: string) {
  session.role = role;
  nav.pathname = pathname;
  return render(
    <I18nProvider>
      <AppShell role={role}>
        <p>page content</p>
      </AppShell>
    </I18nProvider>,
  );
}

beforeEach(() => {
  nav.replace.mockReset();
});

it("gives PMD only the onboarding and users pages, and sends the overview to onboarding", async () => {
  shell("ADMIN", "/admin");

  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/admin/onboarding"));
  const menu = screen.getByRole("navigation", { name: "Main" });
  expect(within(menu).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
    "/admin/onboarding",
    "/admin/users",
    "/notifications",
  ]);
  expect(screen.queryByText("page content")).toBeNull();
  expect(screen.queryByText(t("common.language"))).toBeNull();
});

it("shows a released page as usual", () => {
  shell("ADMIN", "/admin/onboarding");
  expect(screen.getByText("page content")).toBeTruthy();
  expect(nav.replace).not.toHaveBeenCalled();
});

it("tells an approved plant that its pages are coming", async () => {
  route("GET /api/v1/onboarding/me", { status: "APPROVED" });
  shell("COLLECTOR", "/collector");

  expect(await screen.findByText(t("soon.title"))).toBeTruthy();
  expect(screen.queryByText("page content")).toBeNull();
  expect(nav.replace).not.toHaveBeenCalled();
});
