"use client";

import { LotsTable } from "@/components/Tables";
import { ErrorNotice, Loading, PageHead } from "@/components/ui";
import { api, call } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

const RECEIVED = ["DELIVERED", "LAB_DISCREPANCY", "LAB_APPROVED", "SETTLED"];

export default function CollectorLots() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useLoad(() => call(api.GET("/api/v1/lots", {})));
  const received = (data ?? []).filter((l) => RECEIVED.includes(l.status));
  return (
    <>
      <PageHead title={t("received.title")} subtitle={t("received.subtitle")} />
      <ErrorNotice error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : <LotsTable lots={received} hrefBase="/collector/lots" emptyTitle={t("received.empty")} />}
    </>
  );
}
