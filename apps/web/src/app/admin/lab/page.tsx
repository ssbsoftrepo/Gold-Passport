"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, ErrorNotice, Loading, PageHead } from "@/components/ui";
import { api, call, type Schemas } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useAction, useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

export default function LabDiscrepancies() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useLoad(() =>
    call(api.GET("/api/v1/admin/lab-results", { params: { query: { status: "DISCREPANCY_OPEN" } } })),
  );
  return (
    <>
      <PageHead title={t("admin.lab.title")} subtitle={t("admin.lab.subtitle")} />
      <ErrorNotice error={error} onRetry={reload} />
      {loading && !data ? (
        <Loading />
      ) : data && data.length === 0 ? (
        <div className="table-wrap"><Empty title={t("admin.lab.empty")} /></div>
      ) : (
        <div className="stack">
          {data?.map((r) => <Discrepancy key={r.id} result={r} onResolved={reload} />)}
        </div>
      )}
    </>
  );
}

function Discrepancy({ result, onResolved }: { result: Schemas["LabResult"]; onResolved: () => void }) {
  const { t, locale } = useI18n();
  const action = useAction();
  const [form, setForm] = useState({
    finalPurityPct: String(result.measuredPurityPct),
    finalWeightGrams: String(result.measuredWeightGrams),
    notes: "",
  });

  async function resolve(e: React.FormEvent) {
    e.preventDefault();
    const ok = await action.run(() =>
      call(
        api.POST("/api/v1/admin/lots/{lotId}/lab-result/resolve", {
          params: { path: { lotId: result.lotId } },
          body: {
            finalPurityPct: Number(form.finalPurityPct.replace(",", ".")),
            finalWeightGrams: Number(form.finalWeightGrams.replace(",", ".")),
            notes: form.notes,
          },
        }),
      ),
    );
    if (ok) onResolved();
  }

  const n = (v: number) => formatNumber(v, locale, 2);
  return (
    <section className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Link href={`/admin/lots/${result.lotId}`} className="stamp">{result.lotCode}</Link>
        <span className="muted">{result.labName}, {formatDateTime(result.recordedAt, locale)}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th />
              <th>{t("lot.purity")}</th>
              <th>{t("lot.weight")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{t("lot.declared")}</td>
              <td>{n(result.declaredPurityPct)} %</td>
              <td>{n(result.declaredWeightGrams)} g</td>
            </tr>
            <tr>
              <td>{t("lot.verified")}</td>
              <td>{n(result.measuredPurityPct)} %</td>
              <td>{n(result.measuredWeightGrams)} g</td>
            </tr>
            <tr>
              <td>{t("lab.difference")}</td>
              <td style={{ color: "var(--cinnabar)" }}>{n(result.purityDeltaPct)} pts</td>
              <td style={{ color: "var(--cinnabar)" }}>{n(result.weightDeltaPct)} %</td>
            </tr>
          </tbody>
        </table>
      </div>
      <form className="stack" onSubmit={resolve}>
        <ErrorNotice error={action.error} />
        <div className="form-grid">
          <label className="field">
            {t("admin.lab.finalPurity")}
            <input required inputMode="decimal" value={form.finalPurityPct}
              onChange={(e) => setForm({ ...form, finalPurityPct: e.target.value })} />
          </label>
          <label className="field">
            {t("admin.lab.finalWeight")}
            <input required inputMode="decimal" value={form.finalWeightGrams}
              onChange={(e) => setForm({ ...form, finalWeightGrams: e.target.value })} />
          </label>
        </div>
        <label className="field">
          {t("common.notes")}
          <textarea required value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        <div>
          <button className="btn" disabled={action.pending || form.notes.trim() === ""}>{t("admin.lab.resolve")}</button>
        </div>
      </form>
    </section>
  );
}
