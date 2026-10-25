"use client";

import { useState } from "react";
import { TransportsTable } from "@/components/Tables";
import { ErrorNotice, Loading, PageHead } from "@/components/ui";
import { api, call, type Schemas } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { useAction, useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

type Transport = Schemas["Transport"];

/** Incoming transports: approve the planned receipt, approve the pickup, mark as received. */
export default function CollectorTransports() {
  const { t } = useI18n();
  const action = useAction();
  const { data, error, loading, reload } = useLoad(() => call(api.GET("/api/v1/transports", {})));

  async function act(fn: () => Promise<unknown>) {
    const ok = await action.run(fn);
    if (ok) await reload();
  }

  return (
    <>
      <PageHead title={t("nav.incoming")} subtitle={t("collector.overview.subtitle")} />
      <ErrorNotice error={error ?? action.error} onRetry={error ? reload : undefined} />
      {loading && !data ? (
        <Loading />
      ) : (
        <TransportsTable
          transports={data ?? []}
          emptyTitle={t("transport.empty")}
          hideCollector
          actions={(tr) => <Actions tr={tr} pending={action.pending} act={act} />}
        />
      )}
    </>
  );
}

function Actions({ tr, pending, act }: { tr: Transport; pending: boolean; act: (fn: () => Promise<unknown>) => void }) {
  const { t, locale } = useI18n();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const params = { path: { transportId: tr.id } };

  if (tr.status === "PENDING_CONFIRMATION" && !tr.collectorConfirmedAt) {
    return declining ? (
      <div className="stack" style={{ minWidth: 220 }}>
        <label className="field">
          {t("transport.declineReason")}
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="row">
          <button className="btn btn-danger" disabled={pending || reason.trim() === ""}
            onClick={() => act(() => call(api.POST("/api/v1/transports/{transportId}/decline", { params, body: { reason } })))}>
            {t("transport.decline")}
          </button>
          <button className="btn btn-quiet" onClick={() => setDeclining(false)}>{t("common.cancel")}</button>
        </div>
      </div>
    ) : (
      <div className="stack" style={{ minWidth: 200 }}>
        {tr.minerConfirmedAt && <span className="muted">{t("transport.minerConfirmed")}</span>}
        <button className="btn" disabled={pending}
          onClick={() => act(() => call(api.POST("/api/v1/transports/{transportId}/collector-confirm", { params })))}>
          {t("transport.confirmReceipt")}
        </button>
        <button className="btn btn-quiet" onClick={() => setDeclining(true)}>{t("transport.decline")}</button>
      </div>
    );
  }
  if (tr.status === "PENDING_CONFIRMATION") {
    return <span className="muted">{t("transport.collectorConfirmed")}</span>;
  }
  if (tr.status === "AT_MINER") {
    return (
      <div className="stack" style={{ minWidth: 200 }}>
        {tr.arrivalDistanceKm !== null && (
          <span className="muted">{t("transport.arrivalDistance", { km: formatNumber(tr.arrivalDistanceKm, locale) })}</span>
        )}
        {tr.handoverConfirmedAt && <span className="muted">{t("transport.handover")}</span>}
        {tr.pickupApprovedAt ? (
          <span className="muted">{t("transport.pickupApproved")}</span>
        ) : (
          <button className="btn" disabled={pending}
            onClick={() => act(() => call(api.POST("/api/v1/transports/{transportId}/approve-pickup", { params })))}>
            {t("transport.approvePickup")}
          </button>
        )}
      </div>
    );
  }
  if (tr.status === "ARRIVED_AT_COLLECTOR") {
    return (
      <button className="btn btn-good" disabled={pending}
        onClick={() => act(() => call(api.POST("/api/v1/transports/{transportId}/receive", { params })))}>
        {t("transport.markReceived")}
      </button>
    );
  }
  return null;
}
