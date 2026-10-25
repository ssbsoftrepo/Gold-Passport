"use client";

import { useState } from "react";
import { ErrorNotice, Loading, PageHead } from "@/components/ui";
import { api, call, type Schemas } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

const ROLES: Schemas["Role"][] = ["MINER", "TRANSPORTER", "COLLECTOR", "ADMIN"];

export default function AdminUsers() {
  const { t, locale } = useI18n();
  const [role, setRole] = useState<Schemas["Role"] | "ALL">("ALL");
  const { data, error, loading, reload } = useLoad(
    () => call(api.GET("/api/v1/admin/users", { params: { query: role === "ALL" ? {} : { role } } })),
    [role],
  );
  return (
    <>
      <PageHead title={t("admin.users.title")} subtitle={t("admin.users.subtitle")}>
        <label className="field">
          {t("common.role")}
          <select value={role} onChange={(e) => setRole(e.target.value as Schemas["Role"] | "ALL")}>
            <option value="ALL">{t("common.all")}</option>
            {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
          </select>
        </label>
      </PageHead>
      <ErrorNotice error={error} onRetry={reload} />
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("common.name")}</th>
                <th>{t("common.phone")}</th>
                <th>{t("common.email")}</th>
                <th>{t("common.role")}</th>
                <th>{t("common.created")}</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((u) => (
                <tr key={u.id}>
                  <td>{u.displayName ?? "—"}</td>
                  <td>{u.phone}</td>
                  <td>{u.email ?? "—"}</td>
                  <td>{u.role ? t(`role.${u.role}`) : t("role.UNASSIGNED")}</td>
                  <td className="muted">{formatDateTime(u.createdAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
