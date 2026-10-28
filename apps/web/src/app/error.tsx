"use client";

import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { reportError } from "@/lib/monitoring";

/** A page crashed while rendering: report it and let the user try again instead of a blank page. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    reportError(error);
  }, [error]);

  // Not ErrorNotice: it reads a TypeError as "no connection", but here it is a bug in the page.
  return (
    <main className="main">
      <div className="notice notice-bad row" role="alert">
        <span>{t("errors.generic")}</span>
        <button className="link-button" onClick={reset}>
          {t("common.retry")}
        </button>
      </div>
    </main>
  );
}
