"use client";

import { useState } from "react";
import { DecisionForm, Empty, ErrorNotice, Loading, PageHead, StatusTag } from "@/components/ui";
import { api, call, type Schemas } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAction, useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

type Status = Schemas["RelationshipStatus"];
const FILTERS: (Status | "ALL")[] = ["PENDING_REVIEW", "CLARIFICATION_REQUESTED", "APPROVED", "REJECTED", "ALL"];

export default function RelationshipsQueue() {
  const { t, locale } = useI18n();
  const [filter, setFilter] = useState<Status | "ALL">("PENDING_REVIEW");
  const [selected, setSelected] = useState<string | null>(null);
  const action = useAction();
  const { data, error, loading, reload } = useLoad(
    () => call(api.GET("/api/v1/admin/relationships", { params: { query: filter === "ALL" ? {} : { status: filter } } })),
    [filter],
  );

  const decide = (id: string, kind: "approve" | "request-clarification" | "reject") => async (note: string) => {
    const params = { path: { relationshipId: id } };
    const body = { notes: note || null };
    const ok = await action.run(() => {
      if (kind === "approve") return call(api.POST("/api/v1/admin/relationships/{relationshipId}/approve", { params, body }));
      if (kind === "reject") return call(api.POST("/api/v1/admin/relationships/{relationshipId}/reject", { params, body }));
      return call(api.POST("/api/v1/admin/relationships/{relationshipId}/request-clarification", { params, body }));
    });
    if (ok) {
      setSelected(null);
      await reload();
    }
  };

  return (
    <>
      <PageHead title={t("admin.rel.title")} subtitle={t("admin.rel.subtitle")}>
        <label className="field">
          {t("common.status")}
          <select value={filter} onChange={(e) => setFilter(e.target.value as Status | "ALL")}>
            {FILTERS.map((f) => (
              <option key={f} value={f}>{f === "ALL" ? t("common.all") : t(`status.${f}`)}</option>
            ))}
          </select>
        </label>
      </PageHead>
      <ErrorNotice error={error ?? action.error} onRetry={error ? reload : undefined} />
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          {data && data.length === 0 ? (
            <Empty title={t("admin.rel.empty")} />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("admin.rel.owner")}</th>
                  <th>{t("admin.rel.counterparty")}</th>
                  <th>{t("common.document")}</th>
                  <th>{t("admin.rel.linked")}</th>
                  <th>{t("common.status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.map((r) => (
                  <RelationshipRow
                    key={r.id}
                    r={r}
                    open={selected === r.id}
                    onToggle={() => setSelected(selected === r.id ? null : r.id)}
                    pending={action.pending}
                    onDecide={decide}
                    when={formatDateTime(r.createdAt, locale)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}

function RelationshipRow({
  r,
  open,
  onToggle,
  pending,
  onDecide,
  when,
}: {
  r: Schemas["CommercialRelationship"];
  open: boolean;
  onToggle: () => void;
  pending: boolean;
  onDecide: (id: string, kind: "approve" | "request-clarification" | "reject") => (note: string) => void;
  when: string;
}) {
  const { t } = useI18n();
  const reviewable = r.status === "PENDING_REVIEW";
  return (
    <>
      <tr>
        <td>
          {r.ownerName ?? "—"}
          <div className="muted">{t(`role.${r.ownerRole}`)}, {when}</div>
        </td>
        <td>
          {r.entityName}
          <div className="muted">
            {t(`role.${r.counterpartyRole}`)}
            {r.contactPerson ? `, ${r.contactPerson}` : ""}
            {r.phone ? `, ${r.phone}` : ""}
          </div>
        </td>
        <td>{r.documentType} {r.documentNumber}</td>
        <td>{r.counterpartyUserId ? t("common.yes") : <span style={{ color: "var(--cinnabar)" }}>{t("admin.rel.notLinked")}</span>}</td>
        <td>
          <StatusTag status={r.status} />
          {r.reviewNotes && <div className="muted">{r.reviewNotes}</div>}
        </td>
        <td>
          {reviewable && (
            <button className="btn btn-quiet" onClick={onToggle} aria-expanded={open}>
              {t("admin.onb.decision")}
            </button>
          )}
        </td>
      </tr>
      {open && reviewable && (
        <tr>
          <td colSpan={6} style={{ background: "#f4f6f2" }}>
            <DecisionForm
              noteLabel={t("common.notes")}
              pending={pending}
              actions={[
                { label: t("admin.rel.approve"), variant: "good", onClick: onDecide(r.id, "approve") },
                { label: t("admin.rel.clarify"), variant: "quiet", requiresNote: true, onClick: onDecide(r.id, "request-clarification") },
                { label: t("admin.rel.reject"), variant: "danger", requiresNote: true, onClick: onDecide(r.id, "reject") },
              ]}
            />
          </td>
        </tr>
      )}
    </>
  );
}
