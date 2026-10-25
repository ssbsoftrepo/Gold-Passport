"use client";

import Link from "next/link";
import { LotsTable } from "@/components/Tables";
import { ErrorNotice, Loading, PageHead } from "@/components/ui";
import { api, call } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

export default function CollectorOverview() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useLoad(async () => {
    const [transports, lots, settlements] = await Promise.all([
      call(api.GET("/api/v1/transports", {})),
      call(api.GET("/api/v1/lots", {})),
      call(api.GET("/api/v1/settlements")),
    ]);
    return {
      toConfirm: transports.filter((x) => x.status === "PENDING_CONFIRMATION" && !x.collectorConfirmedAt).length,
      atMiner: transports.filter((x) => x.status === "AT_MINER" && !x.pickupApprovedAt).length,
      arrived: transports.filter((x) => x.status === "ARRIVED_AT_COLLECTOR").length,
      labPending: lots.filter((l) => l.status === "DELIVERED").length,
      toPay: settlements.filter((s) => s.status === "AGREED").length,
      recent: lots.filter((l) => ["DELIVERED", "LAB_DISCREPANCY", "LAB_APPROVED", "SETTLED"].includes(l.status)).slice(0, 8),
    };
  });

  return (
    <>
      <PageHead title={t("collector.overview.title")} subtitle={t("collector.overview.subtitle")} />
      <ErrorNotice error={error} onRetry={reload} />
      {loading && !data ? (
        <Loading />
      ) : data ? (
        <>
          <nav className="tally" aria-label={t("collector.overview.title")}>
            <Link href="/collector/transports"><strong>{data.toConfirm}</strong><span>{t("collector.overview.toConfirm")}</span></Link>
            <Link href="/collector/transports"><strong>{data.atMiner}</strong><span>{t("collector.overview.atMiner")}</span></Link>
            <Link href="/collector/transports"><strong>{data.arrived}</strong><span>{t("collector.overview.arrived")}</span></Link>
            <Link href="/collector/lots"><strong>{data.labPending}</strong><span>{t("collector.overview.labPending")}</span></Link>
            <Link href="/collector/lots"><strong>{data.toPay}</strong><span>{t("collector.overview.toPay")}</span></Link>
          </nav>
          <section className="stack">
            <h2>{t("received.title")}</h2>
            <LotsTable lots={data.recent} hrefBase="/collector/lots" emptyTitle={t("received.empty")} />
          </section>
        </>
      ) : null}
    </>
  );
}
