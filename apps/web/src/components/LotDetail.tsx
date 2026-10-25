"use client";

import Link from "next/link";
import { api, call, type Schemas } from "@/lib/api";
import { formatCoords, formatDateTime, formatNumber, mapsUrl, shortHash } from "@/lib/format";
import { useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { ErrorNotice, Facts, FileButton, Loading, StatusTag } from "./ui";

type Lot = Schemas["Lot"];

/** Facts, extraction evidence and the chain of custody of one lot. */
export function LotSummary({ lot }: { lot: Lot }) {
  const { t, locale } = useI18n();
  const purity = (v: number | null) => (v === null ? "—" : <span className="figure">{t("common.percent", { value: formatNumber(v, locale, 2) })}</span>);
  const weight = (v: number | null) => (v === null ? "—" : <span className="figure">{t("common.grams", { value: formatNumber(v, locale, 2) })}</span>);

  return (
    <div className="split">
      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="stamp" style={{ fontSize: "var(--step-2)" }}>{lot.code}</span>
          <StatusTag status={lot.status} />
        </div>
        <Facts
          items={[
            [t("lot.miner"), lot.minerName ?? "—"],
            [t("lot.site"), lot.mineSiteName],
            [t("lot.custodian"), t(`role.${lot.custodianRole}`)],
            [`${t("lot.declared")}: ${t("lot.purity")}`, purity(lot.declaredPurityPct)],
            [`${t("lot.declared")}: ${t("lot.weight")}`, weight(lot.declaredWeightGrams)],
            [`${t("lot.verified")}: ${t("lot.purity")}`, purity(lot.verifiedPurityPct)],
            [`${t("lot.verified")}: ${t("lot.weight")}`, weight(lot.verifiedWeightGrams)],
            [t("lot.minerLab"), lot.minerLabReportFileId ? (
              <>
                {lot.minerLabName}, <FileButton fileId={lot.minerLabReportFileId} label={t("lot.labReport")} />
              </>
            ) : "—"],
            [t("common.created"), formatDateTime(lot.createdAt, locale)],
          ]}
        />
        <Link href={`/passport/${lot.code}`} className="link-button" target="_blank">
          {t("lot.publicPassport")}
        </Link>
      </section>

      <section className="panel stack">
        <h2>{t("lot.evidence")}</h2>
        <ol className="stack" style={{ margin: 0, paddingLeft: 18 }}>
          {lot.evidence.map((e, i) => (
            <li key={e.id}>
              <FileButton fileId={e.fileId} label={t("lot.evidenceItem", { n: i + 1 })} />
              <div className="muted">
                {t("lot.gps")}:{" "}
                <a href={mapsUrl(e.latitude, e.longitude)} target="_blank" rel="noreferrer">
                  {formatCoords(e.latitude, e.longitude)}
                </a>
                {e.accuracyMeters !== null && ` ${t("lot.accuracy", { m: Math.round(e.accuracyMeters) })}`}
              </div>
              <div className="muted">
                {t("lot.capturedAt")}: {formatDateTime(e.capturedAt ?? e.receivedAt, locale)}
              </div>
              <div className="hash">sha256 {shortHash(e.sha256)}</div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** The hash-chained custody ledger with its integrity verdict. */
export function LedgerTimeline({ lotId }: { lotId: string }) {
  const { t, locale } = useI18n();
  const { data, error, loading, reload } = useLoad(
    () => call(api.GET("/api/v1/lots/{lotId}/ledger", { params: { path: { lotId } } })),
    [lotId],
  );
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNotice error={error} onRetry={reload} />;

  const custodyEvents = new Set(["lot.CUSTODY_TO_TRANSPORTER", "lot.CUSTODY_TO_COLLECTOR", "lot.CREATED"]);
  return (
    <section className="panel stack">
      <h2>{t("lot.ledger")}</h2>
      <div className={`notice ${data.verified ? "notice-good" : "notice-bad"}`}>
        {data.verified ? t("lot.ledgerVerified") : t("lot.ledgerBroken")}
      </div>
      <ol className="timeline">
        {data.entries.map((e) => (
          <li key={e.sequence}>
            <span className={`dot ${custodyEvents.has(e.eventType) ? "custody" : ""}`} aria-hidden />
            <div>
              <div>
                <strong>{t(`event.${e.eventType}`)}</strong>{" "}
                <span className="muted">
                  {e.actorRole ? `${t(`role.${e.actorRole}`)}, ` : ""}
                  {formatDateTime(e.occurredAt, locale)}
                </span>
              </div>
              <div className="hash">
                #{e.sequence} {shortHash(e.hash)}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
