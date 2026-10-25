"use client";

import { useState } from "react";
import { Empty, ErrorNotice, Loading, PageHead, StatusTag } from "@/components/ui";
import { api, call, type Schemas } from "@/lib/api";
import { useAction, useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

/** Collectors pick PMD-approved Miners and Transporters from the directory (approved at once). */
export default function Partners() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useLoad(() => call(api.GET("/api/v1/relationships")));
  const [role, setRole] = useState<"MINER" | "TRANSPORTER">("MINER");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Schemas["Participant"][] | null>(null);
  const action = useAction();

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const found = await action.run(() => call(api.GET("/api/v1/participants", { params: { query: { role, q } } })));
    if (found) setResults(found);
  }

  async function add(p: Schemas["Participant"]) {
    const ok = await action.run(() =>
      call(api.POST("/api/v1/relationships", { body: { counterpartyRole: p.role, counterpartyUserId: p.userId } })),
    );
    if (ok) {
      setResults((r) => r?.filter((x) => x.userId !== p.userId) ?? null);
      await reload();
    }
  }

  const known = new Set((data ?? []).map((r) => r.counterpartyUserId));

  return (
    <>
      <PageHead title={t("partners.title")} subtitle={t("partners.subtitle")} />
      <ErrorNotice error={error ?? action.error} onRetry={error ? reload : undefined} />

      <section className="panel stack">
        <h2>{t("partners.add")}</h2>
        <p className="muted">{t("partners.searchHelp")}</p>
        <form className="row" onSubmit={search} style={{ alignItems: "flex-end" }}>
          <label className="field">
            {t("common.role")}
            <select value={role} onChange={(e) => setRole(e.target.value as "MINER" | "TRANSPORTER")}>
              <option value="MINER">{t("role.MINER")}</option>
              <option value="TRANSPORTER">{t("role.TRANSPORTER")}</option>
            </select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 200 }}>
            {t("common.search")}
            <input value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <button className="btn btn-quiet" disabled={action.pending}>{t("common.search")}</button>
        </form>
        {results && results.length === 0 && <p className="muted">{t("partners.noResults")}</p>}
        {results && results.length > 0 && (
          <table>
            <tbody>
              {results.map((p) => (
                <tr key={p.userId}>
                  <td>{p.displayName}</td>
                  <td>{t(`role.${p.role}`)}</td>
                  <td className="muted">{p.documentType} {p.documentNumberMasked}</td>
                  <td>
                    {known.has(p.userId) ? (
                      <StatusTag status="APPROVED" />
                    ) : (
                      <button className="btn" disabled={action.pending} onClick={() => add(p)}>{t("partners.addThis")}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {loading && !data ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          {data && data.length === 0 ? (
            <Empty title={t("partners.empty")} />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("common.name")}</th>
                  <th>{t("common.role")}</th>
                  <th>{t("common.document")}</th>
                  <th>{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((r) => {
                  const iAmOwner = r.ownerRole === "COLLECTOR";
                  return (
                    <tr key={r.id}>
                      <td>{iAmOwner ? r.entityName : r.ownerName ?? "—"}</td>
                      <td>{t(`role.${iAmOwner ? r.counterpartyRole : r.ownerRole}`)}</td>
                      <td className="muted">{iAmOwner ? `${r.documentType} ${r.documentNumber}` : "—"}</td>
                      <td><StatusTag status={r.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
