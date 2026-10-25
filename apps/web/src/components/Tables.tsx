"use client";

import { useRouter } from "next/navigation";
import type { Schemas } from "@/lib/api";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { Empty, StatusTag } from "./ui";

export function LotsTable({ lots, hrefBase, emptyTitle }: { lots: Schemas["Lot"][]; hrefBase: string; emptyTitle: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  if (lots.length === 0) return <div className="table-wrap"><Empty title={emptyTitle} /></div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t("lot.code")}</th>
            <th>{t("lot.miner")}</th>
            <th>{t("lot.site")}</th>
            <th>{t("lot.weight")}</th>
            <th>{t("lot.purity")}</th>
            <th>{t("common.status")}</th>
            <th>{t("common.updated")}</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((l) => (
            <tr key={l.id} className="clickable" onClick={() => router.push(`${hrefBase}/${l.id}`)}>
              <td>
                <a href={`${hrefBase}/${l.id}`} className="stamp" onClick={(e) => e.preventDefault()}>
                  {l.code}
                </a>
              </td>
              <td>{l.minerName ?? "—"}</td>
              <td>{l.mineSiteName}</td>
              <td>{formatNumber(l.verifiedWeightGrams ?? l.declaredWeightGrams, locale)}</td>
              <td>{formatNumber(l.verifiedPurityPct ?? l.declaredPurityPct, locale)}</td>
              <td><StatusTag status={l.status} /></td>
              <td className="muted">{formatDateTime(l.updatedAt, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TransportsTable({
  transports,
  emptyTitle,
  actions,
  hideCollector = false,
}: {
  transports: Schemas["Transport"][];
  emptyTitle: string;
  actions?: (t: Schemas["Transport"]) => React.ReactNode;
  /** The collector's own portal does not need a column with its own name. */
  hideCollector?: boolean;
}) {
  const { t, locale } = useI18n();
  if (transports.length === 0) return <div className="table-wrap"><Empty title={emptyTitle} /></div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t("transport.code")}</th>
            <th>{t("transport.lot")}</th>
            <th>{t("transport.transporter")}</th>
            <th>{t("transport.miner")}</th>
            {!hideCollector && <th>{t("transport.collector")}</th>}
            <th>{t("transport.planned")}</th>
            <th>{t("common.status")}</th>
            {actions && <th />}
          </tr>
        </thead>
        <tbody>
          {transports.map((tr) => (
            <tr key={tr.id}>
              <td className="stamp">{tr.code}</td>
              <td className="stamp">{tr.lotCode ?? "—"}</td>
              <td>{tr.transporterName ?? "—"}</td>
              <td>{tr.minerName ?? "—"}</td>
              {!hideCollector && <td>{tr.collectorName ?? "—"}</td>}
              <td>{formatDate(tr.plannedPickupDate, locale)}</td>
              <td>
                <StatusTag status={tr.status} />
                {tr.locationMismatch && (
                  <div className="muted" style={{ color: "var(--cinnabar)" }}>{t("transport.locationMismatch")}</div>
                )}
              </td>
              {actions && <td>{actions(tr)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
