"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Empty, ErrorNotice, Loading, PageHead, StatusTag } from "@/components/ui";
import { api, call, type Schemas } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

type Status = Schemas["OnboardingStatus"];
const FILTERS: (Status | "ALL")[] = ["SUBMITTED", "CORRECTIONS_REQUESTED", "APPROVED", "REJECTED", "DRAFT", "ALL"];

export default function OnboardingQueue() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [filter, setFilter] = useState<Status | "ALL">("SUBMITTED");
  const { data, error, loading, reload } = useLoad(
    () =>
      call(
        api.GET("/api/v1/admin/onboarding", {
          params: { query: filter === "ALL" ? {} : { status: filter } },
        }),
      ),
    [filter],
  );

  return (
    <>
      <PageHead title={t("admin.onb.title")} subtitle={t("admin.onb.subtitle")}>
        <label className="field">
          {t("common.status")}
          <select value={filter} onChange={(e) => setFilter(e.target.value as Status | "ALL")}>
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {f === "ALL" ? t("common.all") : t(`status.${f}`)}
              </option>
            ))}
          </select>
        </label>
      </PageHead>
      <ErrorNotice error={error} onRetry={reload} />
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          {data && data.length === 0 ? (
            <Empty title={t("admin.onb.empty")} />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("admin.onb.applicant")}</th>
                  <th>{t("common.role")}</th>
                  <th>{t("common.document")}</th>
                  <th>{t("admin.onb.kyc")}</th>
                  <th>{t("admin.onb.submitted")}</th>
                  <th>{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((a) => (
                  <tr key={a.id} className="clickable" onClick={() => router.push(`/admin/onboarding/${a.id}`)}>
                    <td>
                      {(a.role === "COLLECTOR" ? a.companyName : a.fullName) ?? a.phone}
                      <div className="muted">{a.phone}</div>
                    </td>
                    <td>{t(`role.${a.role}`)}</td>
                    <td>{a.role === "COLLECTOR" ? `RUC ${a.ruc ?? "—"}` : `${a.documentType ?? ""} ${a.documentNumber ?? "—"}`}</td>
                    <td>{t(`kyc.${a.kycStatus}`)}</td>
                    <td className="muted">{formatDateTime(a.submittedAt, locale)}</td>
                    <td><StatusTag status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
