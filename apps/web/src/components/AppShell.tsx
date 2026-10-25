"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, call } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { homeFor, useSession } from "@/lib/session";
import { Loading } from "./ui";

type NavItem = { href: string; key: string };

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", key: "nav.overview" },
  { href: "/admin/onboarding", key: "nav.onboarding" },
  { href: "/admin/relationships", key: "nav.relationships" },
  { href: "/admin/lots", key: "nav.lots" },
  { href: "/admin/transports", key: "nav.transports" },
  { href: "/admin/lab", key: "nav.lab" },
  { href: "/admin/settlements", key: "nav.settlements" },
  { href: "/admin/users", key: "nav.users" },
];

const COLLECTOR_NAV: NavItem[] = [
  { href: "/collector", key: "nav.overview" },
  { href: "/collector/transports", key: "nav.incoming" },
  { href: "/collector/lots", key: "nav.received" },
  { href: "/collector/partners", key: "nav.partners" },
];

/**
 * Authenticated layout with the role's navigation. Redirects to /login when signed out and to
 * the user's own home when the role does not match. Collectors must be approved by PMD first.
 */
export function AppShell({ role, children }: { role: "ADMIN" | "COLLECTOR"; children: React.ReactNode }) {
  const { status, user, signOut } = useSession();
  const { t, locale, setLocale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [approved, setApproved] = useState<boolean | null>(role === "ADMIN" ? true : null);

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/login");
    } else if (status === "authenticated" && user && user.role !== role) {
      router.replace(homeFor(user));
    }
  }, [status, user, role, router]);

  useEffect(() => {
    if (role !== "COLLECTOR" || status !== "authenticated" || user?.role !== "COLLECTOR") return;
    call(api.GET("/api/v1/onboarding/me"))
      .then((app) => {
        if (app.status === "APPROVED") setApproved(true);
        else router.replace("/onboarding");
      })
      .catch(() => router.replace("/onboarding"));
  }, [role, status, user, router]);

  if (status !== "authenticated" || !user || user.role !== role || !approved) {
    return (
      <main className="main">
        <Loading />
      </main>
    );
  }

  const nav = role === "ADMIN" ? ADMIN_NAV : COLLECTOR_NAV;
  const isActive = (href: string) =>
    href === "/admin" || href === "/collector" ? pathname === href : pathname.startsWith(href);

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href={nav[0].href} className="brand">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name">PMD</span>
        </Link>
        <nav className="nav" aria-label="Main">
          <div className="nav-group">{t(role === "ADMIN" ? "nav.backOffice" : "nav.plant")}</div>
          {nav.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined}>
              {t(item.key)}
            </Link>
          ))}
          <div className="nav-group" />
          <Link href="/notifications" aria-current={pathname.startsWith("/notifications") ? "page" : undefined}>
            {t("nav.notifications")}
          </Link>
          <Link href="/passport">{t("nav.passport")}</Link>
        </nav>
        <div className="sidebar-footer">
          <span>{t("common.signedInAs", { name: user.displayName ?? user.phone })}</span>
          <button type="button" onClick={() => setLocale(locale === "es" ? "en" : "es")}>
            {t("common.language")}
          </button>
          <button
            type="button"
            onClick={() => {
              signOut();
              router.replace("/login");
            }}
          >
            {t("common.signOut")}
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
