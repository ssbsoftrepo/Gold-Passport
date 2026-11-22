"use client";

import { useState } from "react";
import { ErrorNotice, Loading, PageHead } from "@/components/ui";
import { api, call, type Schemas } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAction, useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

const ROLES: Schemas["Role"][] = ["MINER", "TRANSPORTER", "COLLECTOR", "ADMIN"];

type User = Schemas["UserProfile"];

/** A temporary PIN, shown once to the PMD staff member who reset it. */
type Reset = { user: User; pin: Schemas["TemporaryPin"] };

export default function AdminUsers() {
  const { t, locale } = useI18n();
  const { user: me } = useSession();
  const [reset, setReset] = useState<Reset | null>(null);
  const action = useAction();
  const [role, setRole] = useState<Schemas["Role"] | "ALL">("ALL");
  const { data, error, loading, reload } = useLoad(
    () => call(api.GET("/api/v1/admin/users", { params: { query: role === "ALL" ? {} : { role } } })),
    [role],
  );
  const staff = (u: User) => u.role === "ADMIN";
  const name = (u: User) => u.displayName ?? u.phone;

  const resetPin = (u: User) => {
    if (!window.confirm(t(staff(u) ? "admin.users.resetPasswordConfirm" : "admin.users.resetPinConfirm", { name: name(u) }))) return;
    setReset(null);
    return action.run(async () => {
      const pin = await call(api.POST("/api/v1/admin/users/{userId}/reset-pin", { params: { path: { userId: u.id } } }));
      setReset({ user: u, pin });
    });
  };

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
      <ErrorNotice error={action.error} />
      {reset && (
        <section className="panel stack" role="status" aria-live="polite">
          <h2>{t(staff(reset.user) ? "admin.users.passwordResetTitle" : "admin.users.pinResetTitle", { name: name(reset.user) })}</h2>
          <p className="temporary-pin">{reset.pin.temporaryPin}</p>
          <p>{t("admin.users.resetBody", { phone: reset.user.phone, date: formatDateTime(reset.pin.expiresAt, locale) })}</p>
          <p className="muted">{t("admin.users.resetOnce")}</p>
          <button type="button" className="link-button" style={{ alignSelf: "flex-start" }} onClick={() => setReset(null)}>
            {t("admin.users.resetDone")}
          </button>
        </section>
      )}
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
                <th><span className="sr-only">{t("admin.users.signIn")}</span></th>
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
                  <td>
                    {u.id !== me?.id && (
                      <button type="button" className="link-button" disabled={action.pending} onClick={() => resetPin(u)}>
                        {t(staff(u) ? "admin.users.resetPassword" : "admin.users.resetPin")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
