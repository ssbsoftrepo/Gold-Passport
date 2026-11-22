"use client";

import { isEnabled } from "@/lib/features";
import { useI18n } from "@/lib/i18n";

/** The public Gold Passport pages, for releases that include them (lib/features.ts). */
export default function PassportLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  if (isEnabled("publicPassport")) return children;
  return (
    <main className="passport">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <span className="brand-name" style={{ color: "var(--ink)" }}>PMD</span>
      </div>
      <p>{t("passport.unavailable")}</p>
    </main>
  );
}
