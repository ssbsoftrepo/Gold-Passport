import { isEnabled, type Feature } from "./features";

export type NavItem = { href: string; key: string; feature: Feature };

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", key: "nav.overview", feature: "adminOverview" },
  { href: "/admin/onboarding", key: "nav.onboarding", feature: "onboarding" },
  { href: "/admin/relationships", key: "nav.relationships", feature: "transport" },
  { href: "/admin/lots", key: "nav.lots", feature: "batches" },
  { href: "/admin/transports", key: "nav.transports", feature: "transport" },
  { href: "/admin/lab", key: "nav.lab", feature: "plantFlow" },
  { href: "/admin/settlements", key: "nav.settlements", feature: "plantFlow" },
  { href: "/admin/users", key: "nav.users", feature: "onboarding" },
];

export const COLLECTOR_NAV: NavItem[] = [
  { href: "/collector", key: "nav.overview", feature: "plantFlow" },
  { href: "/collector/transports", key: "nav.incoming", feature: "transport" },
  { href: "/collector/lots", key: "nav.received", feature: "plantFlow" },
  { href: "/collector/partners", key: "nav.partners", feature: "transport" },
];

/** The menu entries this release shows. */
export function visibleNav(nav: NavItem[], enabled: (f: Feature) => boolean = isEnabled): NavItem[] {
  return nav.filter((item) => enabled(item.feature));
}

/** The menu entry a page belongs to: the longest href that is the path or a parent of it. */
export function navItemFor(pathname: string, nav: NavItem[]): NavItem | undefined {
  return nav
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
