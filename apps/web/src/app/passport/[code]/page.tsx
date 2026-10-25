"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ErrorNotice, Facts, Loading } from "@/components/ui";
import { api, ApiError, call } from "@/lib/api";
import { formatDateTime, formatNumber, mapsUrl, shortHash } from "@/lib/format";
import { useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

const CUSTODY = new Set(["lot.CREATED", "lot.CUSTODY_TO_TRANSPORTER", "lot.CUSTODY_TO_COLLECTOR", "lot.SETTLED"]);

/**
 * The public gold passport. Opened from a QR code on the lot's paperwork; shows where the gold
 * came from (rounded), who held it (by role only) and whether the custody ledger is intact.
 */
export default function PassportPage() {
  const { code } = useParams<{ code: string }>();
  const { t, locale, setLocale } = useI18n();
  const { data, error, loading, reload } = useLoad(
    () => call(api.GET("/api/v1/public/passports/{lotCode}", { params: { path: { lotCode: decodeURIComponent(code) } } })),
    [code],
  );

  if (loading && !data) {
    return <main className="passport"><Loading /></main>;
  }
  if (!data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <main className="passport">
        {notFound ? <div className="notice notice-bad">{t("passport.notFound")}</div> : <ErrorNotice error={error} onRetry={reload} />}
        <Link href="/passport">{t("common.back")}</Link>
      </main>
    );
  }

  const pct = (v: number | null) => (v === null ? "—" : t("common.percent", { value: formatNumber(v, locale, 2) }));
  const g = (v: number | null) => (v === null ? "—" : t("common.grams", { value: formatNumber(v, locale, 2) }));

  return (
    <main className="passport">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name" style={{ color: "var(--ink)" }}>PMD</span>
        </div>
        <button className="link-button" onClick={() => setLocale(locale === "es" ? "en" : "es")}>{t("common.language")}</button>
      </div>

      <section className="passport-hallmark" aria-label={t("passport.title")}>
        <div className="stack" style={{ gap: 12, width: "100%" }}>
          <span>{t("passport.title")}</span>
          <span className="code">{data.lotCode}</span>
          <div className="meta">
            <span>{data.mineSiteName}</span>
            <span>{t(`status.${data.status}`)}</span>
            <span className={`seal ${data.ledgerVerified ? "seal-ok" : "seal-broken"}`}>
              {data.ledgerVerified ? t("passport.verified") : t("passport.broken")}
            </span>
          </div>
        </div>
      </section>

      <div className="split">
        <section className="panel stack">
          <h2>{t("passport.declared")}</h2>
          <Facts items={[[t("lot.purity"), pct(data.declaredPurityPct)], [t("lot.weight"), g(data.declaredWeightGrams)]]} />
          <h2>{t("passport.verifiedAssay")}</h2>
          <Facts items={[
            [t("lot.purity"), <span key="p" className="figure">{pct(data.verifiedPurityPct)}</span>],
            [t("lot.weight"), <span key="w" className="figure">{g(data.verifiedWeightGrams)}</span>],
          ]} />
          <h2>{t("passport.origin")}</h2>
          <p>
            {data.approximateOrigin ? (
              <a href={mapsUrl(data.approximateOrigin.latitude, data.approximateOrigin.longitude)} target="_blank" rel="noreferrer">
                {data.approximateOrigin.latitude.toFixed(2)}, {data.approximateOrigin.longitude.toFixed(2)}
              </a>
            ) : "—"}
          </p>
          <p className="muted">{t("passport.evidence", { n: data.evidenceCount })}</p>
        </section>

        <section className="panel stack">
          <h2>{t("passport.journey")}</h2>
          <ol className="timeline">
            {data.timeline.map((e, i) => (
              <li key={`${e.eventType}-${i}`}>
                <span className={`dot ${CUSTODY.has(e.eventType) ? "custody" : ""}`} aria-hidden />
                <div>
                  <strong>{t(`event.${e.eventType}`)}</strong>
                  <div className="muted">
                    {e.actorRole ? `${t(`role.${e.actorRole}`)}, ` : ""}
                    {formatDateTime(e.occurredAt, locale)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <footer className="stack muted">
        <p>{t("passport.privacy")}</p>
        <p>
          {t("passport.headHash")}: <span className="hash">{shortHash(data.headHash)}</span>
        </p>
        <p>{t("passport.generated", { date: formatDateTime(data.generatedAt, locale) })}</p>
      </footer>
    </main>
  );
}
