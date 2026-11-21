import { describe, expect, it } from "vitest";
import { isEnabled, type Feature } from "../features";
import { ADMIN_NAV, COLLECTOR_NAV, navItemFor, visibleNav } from "../nav";

const phase = (n: number) => (f: Feature) => isEnabled(f, n);

describe("menus by release", () => {
  it("gives PMD only onboarding and users in phase 1", () => {
    expect(visibleNav(ADMIN_NAV, phase(1)).map((i) => i.href)).toEqual(["/admin/onboarding", "/admin/users"]);
  });

  it("gives a plant no pages until its features are released", () => {
    expect(visibleNav(COLLECTOR_NAV, phase(1))).toEqual([]);
    expect(visibleNav(COLLECTOR_NAV, phase(3)).map((i) => i.href)).toEqual(["/collector/transports", "/collector/partners"]);
  });

  it("shows every page when no release is set", () => {
    expect(visibleNav(ADMIN_NAV)).toEqual(ADMIN_NAV);
  });
});

describe("navItemFor", () => {
  it("finds the menu entry a page belongs to, detail pages included", () => {
    expect(navItemFor("/admin", ADMIN_NAV)?.key).toBe("nav.overview");
    expect(navItemFor("/admin/lots/5bd345da", ADMIN_NAV)?.key).toBe("nav.lots");
    expect(navItemFor("/admin/onboarding/a1", ADMIN_NAV)?.key).toBe("nav.onboarding");
    expect(navItemFor("/notifications", ADMIN_NAV)).toBeUndefined();
  });
});
