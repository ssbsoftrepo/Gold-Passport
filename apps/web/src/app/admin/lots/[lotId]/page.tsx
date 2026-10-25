"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { LabResultPanel, SettlementPanel } from "@/components/LotPanels";
import { LedgerTimeline, LotSummary } from "@/components/LotDetail";
import { ErrorNotice, Loading } from "@/components/ui";
import { api, call } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

export default function AdminLotDetail() {
  const { lotId } = useParams<{ lotId: string }>();
  const { t } = useI18n();
  const { data: lot, error, loading, reload } = useLoad(
    () => call(api.GET("/api/v1/lots/{lotId}", { params: { path: { lotId } } })),
    [lotId],
  );
  if (loading && !lot) return <Loading />;
  if (!lot) return <ErrorNotice error={error} onRetry={reload} />;
  return (
    <>
      <Link href="/admin/lots" className="back">{t("common.back")}</Link>
      <LotSummary lot={lot} />
      <div className="split">
        <LedgerTimeline lotId={lot.id} />
        <div className="stack">
          <LabResultPanel lot={lot} mode="view" onChanged={reload} />
          <SettlementPanel lot={lot} mode="view" onChanged={reload} />
        </div>
      </div>
    </>
  );
}
