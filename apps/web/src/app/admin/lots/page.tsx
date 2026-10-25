"use client";

import { useState } from "react";
import { LotsTable } from "@/components/Tables";
import { ErrorNotice, Loading, PageHead } from "@/components/ui";
import { api, call, type Schemas } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

type Status = Schemas["LotStatus"];
const STATUSES: Status[] = ["OPEN", "COMPLETED", "READY_FOR_TRANSPORT", "ASSIGNED_TO_TRANSPORT", "IN_TRANSIT", "DELIVERED",
  "LAB_DISCREPANCY", "LAB_APPROVED", "SETTLED"];

export default function AdminLots() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Status | "ALL">("ALL");
  const { data, error, loading, reload } = useLoad(
    () => call(api.GET("/api/v1/admin/lots", { params: { query: filter === "ALL" ? {} : { status: filter } } })),
    [filter],
  );
  return (
    <>
      <PageHead title={t("admin.lots.title")} subtitle={t("admin.lots.subtitle")}>
        <label className="field">
          {t("common.status")}
          <select value={filter} onChange={(e) => setFilter(e.target.value as Status | "ALL")}>
            <option value="ALL">{t("common.all")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
        </label>
      </PageHead>
      <ErrorNotice error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : <LotsTable lots={data ?? []} hrefBase="/admin/lots" emptyTitle={t("common.none")} />}
    </>
  );
}
