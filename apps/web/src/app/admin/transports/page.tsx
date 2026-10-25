"use client";

import { useState } from "react";
import { TransportsTable } from "@/components/Tables";
import { ErrorNotice, Loading, PageHead } from "@/components/ui";
import { api, call, type Schemas } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

type Status = Schemas["TransportStatus"];
const STATUSES: Status[] = ["PENDING_CONFIRMATION", "DECLINED", "CONFIRMED", "EN_ROUTE_TO_MINER", "AT_MINER", "IN_TRANSIT",
  "ARRIVED_AT_COLLECTOR", "DELIVERED", "COMPLETED", "CANCELLED"];

export default function AdminTransports() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Status | "ALL">("ALL");
  const { data, error, loading, reload } = useLoad(
    () => call(api.GET("/api/v1/admin/transports", { params: { query: filter === "ALL" ? {} : { status: filter } } })),
    [filter],
  );
  return (
    <>
      <PageHead title={t("admin.transports.title")} subtitle={t("admin.transports.subtitle")}>
        <label className="field">
          {t("common.status")}
          <select value={filter} onChange={(e) => setFilter(e.target.value as Status | "ALL")}>
            <option value="ALL">{t("common.all")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
        </label>
      </PageHead>
      <ErrorNotice error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : <TransportsTable transports={data ?? []} emptyTitle={t("common.none")} />}
    </>
  );
}
