"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, call } from "@/lib/api";
import { isEnabled } from "@/lib/features";
import { useI18n } from "@/lib/i18n";
import { ADMIN_NAV, COLLECTOR_NAV, navItemFor, visibleNav } from "@/lib/nav";
import { homeFor, useSession } from "@/lib/session";
import { Loading } from "./ui";

/**
 * Authenticated layout with the role's navigation. Redirects to /login when signed out and to
 * the user's own home when the role does not match. Collectors must be approved by PMD first.
 * Pages of a later release (lib/features.ts) are left out of the menu; opening one leads to the
 * first page of this release, or to a "coming soon" note when the role has none yet.
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

  const fullNav = role === "ADMIN" ? ADMIN_NAV : COLLECTOR_NAV;
  const nav = visibleNav(fullNav);
  const page = navItemFor(pathname, fullNav);
  const unreleased = page !== undefined && !isEnabled(page.feature);

  const firstPage = nav[0]?.href;
  useEffect(() => {
    if (unreleased && firstPage) router.replace(firstPage);
  }, [unreleased, firstPage, router]);

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

  const isActive = (href: string) =>
    href === "/admin" || href === "/collector" ? pathname === href : pathname.startsWith(href);

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href={firstPage ?? "/notifications"} className="brand">
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
          {isEnabled("publicPassport") && <Link href="/passport">{t("nav.passport")}</Link>}
        </nav>
        <div className="sidebar-footer">
          <span>{t("common.signedInAs", { name: user.displayName ?? user.phone })}</span>
          <Link href="/account" aria-current={pathname.startsWith("/account") ? "page" : undefined}>
            {t(role === "ADMIN" ? "account.changePassword" : "account.changePin")}
          </Link>
          {isEnabled("english") && (
            <button type="button" onClick={() => setLocale(locale === "es" ? "en" : "es")}>
              {t("common.language")}
            </button>
          )}
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
        <div className="page">
          {!unreleased ? (
            children
          ) : firstPage ? (
            <Loading />
          ) : (
            <section className="panel stack">
              <h1>{t("soon.title")}</h1>
              <p>{t("soon.body")}</p>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
