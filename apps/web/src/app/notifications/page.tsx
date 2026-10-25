"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Empty, ErrorNotice, Loading, PageHead } from "@/components/ui";
import { api, call, type Schemas } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAction, useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export default function NotificationsPage() {
  const { user } = useSession();
  const role = user?.role === "COLLECTOR" ? "COLLECTOR" : "ADMIN";
  return (
    <AppShell role={role}>
      <Inbox />
    </AppShell>
  );
}

function Inbox() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const { data, error, loading, reload } = useLoad(() => call(api.GET("/api/v1/notifications", {})));
  const action = useAction();

  const linkFor = (n: Schemas["Notification"]) => {
    const base = user?.role === "ADMIN" ? "/admin" : "/collector";
    if (n.data.lotId) return `${base}/lots/${n.data.lotId}`;
    if (n.data.applicationId && user?.role === "ADMIN") return `/admin/onboarding/${n.data.applicationId}`;
    if (n.data.relationshipId && user?.role === "ADMIN") return "/admin/relationships";
    if (n.data.transportId) return user?.role === "ADMIN" ? "/admin/transports" : "/collector/transports";
    return null;
  };

  return (
    <>
      <PageHead title={t("notif.title")}>
        <button
          className="btn btn-quiet"
          disabled={action.pending}
          onClick={async () => {
            await action.run(() => call(api.POST("/api/v1/notifications/read-all")));
            await reload();
          }}
        >
          {t("notif.markAll")}
        </button>
      </PageHead>
      <ErrorNotice error={error ?? action.error} onRetry={error ? reload : undefined} />
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          {data && data.length === 0 ? (
            <Empty title={t("notif.empty")} />
          ) : (
            <table>
              <tbody>
                {data?.map((n) => {
                  const href = linkFor(n);
                  return (
                    <tr key={n.id} style={n.read ? undefined : { background: "var(--gold-wash)" }}>
                      <td>
                        <strong>{href ? <Link href={href}>{n.title}</Link> : n.title}</strong>
                        <div>{n.body}</div>
                      </td>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>{formatDateTime(n.createdAt, locale)}</td>
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
