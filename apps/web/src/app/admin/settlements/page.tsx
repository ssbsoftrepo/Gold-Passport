"use client";

import Link from "next/link";
import { useState } from "react";
import { DecisionForm, Empty, ErrorNotice, Loading, PageHead, StatusTag } from "@/components/ui";
import { api, call, type Schemas } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useAction, useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

type Status = Schemas["SettlementStatus"];
const FILTERS: (Status | "ALL")[] = ["MINER_ACCEPTED", "PROPOSED", "DISPUTED", "AGREED", "PAID", "ALL"];

export default function AdminSettlements() {
  const { t, locale } = useI18n();
  const [filter, setFilter] = useState<Status | "ALL">("MINER_ACCEPTED");
  const [open, setOpen] = useState<string | null>(null);
  const action = useAction();
  const { data, error, loading, reload } = useLoad(
    () => call(api.GET("/api/v1/admin/settlements", { params: { query: filter === "ALL" ? {} : { status: filter } } })),
    [filter],
  );

  const decide = (lotId: string, kind: "validate" | "reject") => async (note: string) => {
    const params = { path: { lotId } };
    const ok = await action.run(() =>
      kind === "validate"
        ? call(api.POST("/api/v1/admin/lots/{lotId}/settlement/validate", { params, body: { notes: note || null } }))
        : call(api.POST("/api/v1/admin/lots/{lotId}/settlement/reject", { params, body: { reason: note } })),
    );
    if (ok) {
      setOpen(null);
      await reload();
    }
  };

  return (
    <>
      <PageHead title={t("admin.settle.title")} subtitle={t("admin.settle.subtitle")}>
        <label className="field">
          {t("common.status")}
          <select value={filter} onChange={(e) => setFilter(e.target.value as Status | "ALL")}>
            {FILTERS.map((f) => <option key={f} value={f}>{f === "ALL" ? t("common.all") : t(`status.${f}`)}</option>)}
          </select>
        </label>
      </PageHead>
      <ErrorNotice error={error ?? action.error} onRetry={error ? reload : undefined} />
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          {data && data.length === 0 ? (
            <Empty title={t("admin.settle.empty")} />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("lot.code")}</th>
                  <th>{t("settle.amount")}</th>
                  <th>{t("settle.history")}</th>
                  <th>{t("common.updated")}</th>
                  <th>{t("common.status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.map((s) => (
                  <SettlementRow key={s.id} s={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)}
                    pending={action.pending} onDecide={decide} when={formatDateTime(s.updatedAt, locale)}
                    amount={formatMoney(s.amount, s.currency, locale)} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}

function SettlementRow({ s, open, onToggle, pending, onDecide, when, amount }: {
  s: Schemas["Settlement"];
  open: boolean;
  onToggle: () => void;
  pending: boolean;
  onDecide: (lotId: string, kind: "validate" | "reject") => (note: string) => void;
  when: string;
  amount: string;
}) {
  const { t } = useI18n();
  const reviewable = s.status === "MINER_ACCEPTED";
  return (
    <>
      <tr>
        <td><Link href={`/admin/lots/${s.lotId}`} className="stamp">{s.lotCode}</Link></td>
        <td className="figure">{amount}</td>
        <td>{s.proposals.length}</td>
        <td className="muted">{when}</td>
        <td><StatusTag status={s.status} /></td>
        <td>{reviewable && <button className="btn btn-quiet" onClick={onToggle} aria-expanded={open}>{t("admin.onb.decision")}</button>}</td>
      </tr>
      {open && reviewable && (
        <tr>
          <td colSpan={6} style={{ background: "#f4f6f2" }}>
            <DecisionForm
              noteLabel={t("common.notes")}
              pending={pending}
              actions={[
                { label: t("admin.settle.validate"), variant: "good", onClick: onDecide(s.lotId, "validate") },
                { label: t("admin.settle.reject"), variant: "danger", requiresNote: true, onClick: onDecide(s.lotId, "reject") },
              ]}
            />
          </td>
        </tr>
      )}
    </>
  );
}
