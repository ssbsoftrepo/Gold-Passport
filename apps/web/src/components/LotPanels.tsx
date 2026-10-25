"use client";

import { useState } from "react";
import { api, ApiError, call, upload, type Schemas } from "@/lib/api";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useAction, useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { ErrorNotice, Facts, FileButton, Loading, StatusTag } from "./ui";

type Lot = Schemas["Lot"];
type Mode = "view" | "collector";

/** Returns null instead of throwing when the resource does not exist yet (404). */
async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

// ------------------------------------------------------------------ lab

export function LabResultPanel({ lot, mode, onChanged }: { lot: Lot; mode: Mode; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const { data: result, error, loading, reload } = useLoad(
    () => orNull(call(api.GET("/api/v1/lots/{lotId}/lab-result", { params: { path: { lotId: lot.id } } }))),
    [lot.id, lot.status],
  );
  const action = useAction();
  const [form, setForm] = useState({ labName: "", purityPct: "", weightGrams: "" });
  const [file, setFile] = useState<File | null>(null);

  if (loading && result === undefined) return <section className="panel"><Loading /></section>;

  const canRecord = mode === "collector" && result === null && lot.status === "DELIVERED";

  async function record(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("labName", form.labName);
    fd.append("purityPct", form.purityPct.replace(",", "."));
    fd.append("weightGrams", form.weightGrams.replace(",", "."));
    const saved = await action.run(() => upload<Schemas["LabResult"]>(`/api/v1/lots/${lot.id}/lab-result`, fd));
    if (saved) {
      await reload();
      onChanged();
    }
  }

  const pct = (v: number | null) => (v === null ? "—" : t("common.percent", { value: formatNumber(v, locale, 2) }));
  const g = (v: number | null) => (v === null ? "—" : t("common.grams", { value: formatNumber(v, locale, 2) }));
  const signed = (v: number, unit: string) => `${v > 0 ? "+" : ""}${formatNumber(v, locale, 2)} ${unit}`;

  return (
    <section className="panel stack">
      <h2>{t("lab.title")}</h2>
      <ErrorNotice error={error ?? action.error} />
      {result ? (
        <>
          <StatusTag status={result.status} />
          <Facts
            items={[
              [t("lab.labName"), result.labName],
              [`${t("lab.measured")}: ${t("lot.purity")}`, pct(result.measuredPurityPct)],
              [`${t("lab.measured")}: ${t("lot.weight")}`, g(result.measuredWeightGrams)],
              [`${t("lot.declared")}: ${t("lot.purity")}`, pct(result.declaredPurityPct)],
              [`${t("lot.declared")}: ${t("lot.weight")}`, g(result.declaredWeightGrams)],
              [t("lab.difference"), `${signed(result.purityDeltaPct, "pts")}, ${signed(result.weightDeltaPct, "%")}`],
              [t("lab.final"), result.finalPurityPct !== null ? <span className="figure">{pct(result.finalPurityPct)}, {g(result.finalWeightGrams)}</span> : "—"],
              [t("lot.labReport"), <FileButton key="f" fileId={result.reportFileId} />],
              [t("common.created"), formatDateTime(result.recordedAt, locale)],
            ]}
          />
          {result.resolutionNotes && (
            <div className="notice">
              <strong>{t("lab.resolution")}:</strong> {result.resolutionNotes}
            </div>
          )}
        </>
      ) : canRecord ? (
        <form className="stack" onSubmit={record}>
          <p className="muted">{t("lab.help")}</p>
          <div className="form-grid">
            <label className="field">
              {t("lab.labName")}
              <input required value={form.labName} onChange={(e) => setForm({ ...form, labName: e.target.value })} />
            </label>
            <label className="field">
              {t("lab.purity")}
              <input required inputMode="decimal" value={form.purityPct}
                onChange={(e) => setForm({ ...form, purityPct: e.target.value })} />
            </label>
            <label className="field">
              {t("lab.weight")}
              <input required inputMode="decimal" value={form.weightGrams}
                onChange={(e) => setForm({ ...form, weightGrams: e.target.value })} />
            </label>
          </div>
          <label className="field">
            {t("lab.report")}
            <input required type="file" accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <div>
            <button className="btn" disabled={action.pending || !file}>{t("lab.record")}</button>
          </div>
        </form>
      ) : (
        <p className="muted">{t("common.none")}</p>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ settlement

export function SettlementPanel({ lot, mode, onChanged }: { lot: Lot; mode: Mode; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const { data: settlement, error, loading, reload, setData } = useLoad(
    () => orNull(call(api.GET("/api/v1/lots/{lotId}/settlement", { params: { path: { lotId: lot.id } } }))),
    [lot.id, lot.status],
  );
  const action = useAction();
  const [proposal, setProposal] = useState({ amount: "", currency: "PEN" as "PEN" | "USD", pricePerGram: "", notes: "" });
  const [payment, setPayment] = useState({ paymentReference: "", paymentMethod: "BANK_TRANSFER" as Schemas["PaymentMethod"], notes: "" });

  if (loading && settlement === undefined) return <section className="panel"><Loading /></section>;

  const isCollector = mode === "collector";
  const labApproved = lot.status === "LAB_APPROVED" || lot.status === "SETTLED";
  const canPropose = isCollector && labApproved && (settlement === null || settlement?.status === "PROPOSED" || settlement?.status === "DISPUTED");
  const canPay = isCollector && settlement?.status === "AGREED";

  async function propose(e: React.FormEvent) {
    e.preventDefault();
    const updated = await action.run(() =>
      call(
        api.POST("/api/v1/lots/{lotId}/settlement/proposals", {
          params: { path: { lotId: lot.id } },
          body: {
            amount: Number(proposal.amount.replace(",", ".")),
            currency: proposal.currency,
            pricePerGram: proposal.pricePerGram ? Number(proposal.pricePerGram.replace(",", ".")) : null,
            notes: proposal.notes || null,
          },
        }),
      ),
    );
    if (updated) {
      setData(updated);
      setProposal({ ...proposal, amount: "", pricePerGram: "", notes: "" });
    }
  }

  async function markPaid(e: React.FormEvent) {
    e.preventDefault();
    const updated = await action.run(() =>
      call(
        api.POST("/api/v1/lots/{lotId}/settlement/mark-paid", {
          params: { path: { lotId: lot.id } },
          body: { paymentReference: payment.paymentReference, paymentMethod: payment.paymentMethod, notes: payment.notes || null },
        }),
      ),
    );
    if (updated) {
      setData(updated);
      onChanged();
    }
  }

  return (
    <section className="panel stack">
      <h2>{t("settle.title")}</h2>
      <ErrorNotice error={error ?? action.error} onRetry={error ? reload : undefined} />

      {settlement && (
        <>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="figure" style={{ fontSize: "var(--step-2)" }}>
              {formatMoney(settlement.amount, settlement.currency, locale)}
            </span>
            <StatusTag status={settlement.status} />
          </div>
          {settlement.status === "PROPOSED" && <p className="muted">{t("settle.waitingMiner")}</p>}
          {settlement.status === "MINER_ACCEPTED" && <p className="muted">{t("settle.waitingPmd")}</p>}
          {settlement.status === "AGREED" && <div className="notice notice-good">{t("settle.agreed")}</div>}
          {settlement.status === "PAID" && (
            <div className="notice notice-good">
              {t("settle.paid", { date: formatDateTime(settlement.paidAt, locale), ref: settlement.paymentReference })}
            </div>
          )}
          {settlement.adminNotes && <p className="muted">PMD: {settlement.adminNotes}</p>}
          <details>
            <summary>{t("settle.history")} ({settlement.proposals.length})</summary>
            <table>
              <tbody>
                {settlement.proposals.map((p) => (
                  <tr key={p.id}>
                    <td>{formatMoney(p.amount, p.currency, locale)}</td>
                    <td className="muted">{formatDateTime(p.proposedAt, locale)}</td>
                    <td>
                      {p.response ? t(`settle.response.${p.response}`) : "—"}
                      {p.responseReason && <div className="muted">{p.responseReason}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}

      {!settlement && !labApproved && <p className="muted">{t("settle.needsLab")}</p>}
      {!settlement && labApproved && !isCollector && <p className="muted">{t("common.none")}</p>}

      {canPropose && (
        <form className="stack" onSubmit={propose}>
          <div className="form-grid">
            <label className="field">
              {t("settle.amount")}
              <input required inputMode="decimal" value={proposal.amount}
                onChange={(e) => setProposal({ ...proposal, amount: e.target.value })} />
            </label>
            <label className="field">
              {t("settle.currency")}
              <select value={proposal.currency} onChange={(e) => setProposal({ ...proposal, currency: e.target.value as "PEN" | "USD" })}>
                <option value="PEN">PEN</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label className="field">
              {t("settle.pricePerGram")}
              <input inputMode="decimal" value={proposal.pricePerGram}
                onChange={(e) => setProposal({ ...proposal, pricePerGram: e.target.value })} />
            </label>
          </div>
          <label className="field">
            {t("common.notesOptional")}
            <textarea value={proposal.notes} onChange={(e) => setProposal({ ...proposal, notes: e.target.value })} />
          </label>
          <div>
            <button className="btn" disabled={action.pending}>
              {settlement ? t("settle.repropose") : t("settle.propose")}
            </button>
          </div>
        </form>
      )}

      {canPay && (
        <form className="stack" onSubmit={markPaid}>
          <div className="form-grid">
            <label className="field">
              {t("settle.paymentReference")}
              <input required value={payment.paymentReference}
                onChange={(e) => setPayment({ ...payment, paymentReference: e.target.value })} />
            </label>
            <label className="field">
              {t("settle.paymentMethod")}
              <select value={payment.paymentMethod}
                onChange={(e) => setPayment({ ...payment, paymentMethod: e.target.value as Schemas["PaymentMethod"] })}>
                {(["BANK_TRANSFER", "CASH", "OTHER"] as const).map((m) => (
                  <option key={m} value={m}>{t(`settle.method.${m}`)}</option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <button className="btn btn-good" disabled={action.pending}>{t("settle.markPaid")}</button>
          </div>
        </form>
      )}
    </section>
  );
}
