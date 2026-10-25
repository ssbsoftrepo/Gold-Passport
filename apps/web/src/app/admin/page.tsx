"use client";

import Link from "next/link";
import { LotsTable } from "@/components/Tables";
import { ErrorNotice, Loading, PageHead } from "@/components/ui";
import { api, call } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

export default function AdminOverview() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useLoad(async () => {
    const [onboarding, relationships, lab, settlements, inTransit, lots] = await Promise.all([
      call(api.GET("/api/v1/admin/onboarding", { params: { query: { status: "SUBMITTED" } } })),
      call(api.GET("/api/v1/admin/relationships", { params: { query: { status: "PENDING_REVIEW" } } })),
      call(api.GET("/api/v1/admin/lab-results", { params: { query: { status: "DISCREPANCY_OPEN" } } })),
      call(api.GET("/api/v1/admin/settlements", { params: { query: { status: "MINER_ACCEPTED" } } })),
      call(api.GET("/api/v1/admin/lots", { params: { query: { status: "IN_TRANSIT" } } })),
      call(api.GET("/api/v1/admin/lots", {})),
    ]);
    return { onboarding, relationships, lab, settlements, inTransit, lots: lots.slice(0, 8) };
  });

  return (
    <>
      <PageHead title={t("admin.overview.title")} subtitle={t("admin.overview.subtitle")} />
      <ErrorNotice error={error} onRetry={reload} />
      {loading && !data ? (
        <Loading />
      ) : data ? (
        <>
          <nav className="tally" aria-label={t("admin.overview.title")}>
            <Link href="/admin/onboarding">
              <strong>{data.onboarding.length}</strong>
              <span>{t("admin.overview.onboarding")}</span>
            </Link>
            <Link href="/admin/relationships">
              <strong>{data.relationships.length}</strong>
              <span>{t("admin.overview.relationships")}</span>
            </Link>
            <Link href="/admin/lab">
              <strong>{data.lab.length}</strong>
              <span>{t("admin.overview.discrepancies")}</span>
            </Link>
            <Link href="/admin/settlements">
              <strong>{data.settlements.length}</strong>
              <span>{t("admin.overview.settlements")}</span>
            </Link>
            <Link href="/admin/lots">
              <strong>{data.inTransit.length}</strong>
              <span>{t("admin.overview.inTransit")}</span>
            </Link>
          </nav>
          <section className="stack">
            <h2>{t("admin.overview.recent")}</h2>
            <LotsTable lots={data.lots} hrefBase="/admin/lots" emptyTitle={t("common.none")} />
          </section>
        </>
      ) : null}
    </>
  );
}
