"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { DecisionForm, ErrorNotice, Facts, FileButton, Loading, StatusTag } from "@/components/ui";
import { api, call } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAction, useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

export default function OnboardingReview() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const { t, locale } = useI18n();
  const { data: app, error, loading, reload, setData } = useLoad(
    () => call(api.GET("/api/v1/admin/onboarding/{applicationId}", { params: { path: { applicationId } } })),
    [applicationId],
  );
  const action = useAction();

  if (loading && !app) return <Loading />;
  if (!app) return <ErrorNotice error={error} onRetry={reload} />;

  const decide = (kind: "approve" | "request-corrections" | "reject") => async (note: string) => {
    const body = { notes: note || null };
    const params = { path: { applicationId } };
    const updated = await action.run(() => {
      if (kind === "approve") return call(api.POST("/api/v1/admin/onboarding/{applicationId}/approve", { params, body }));
      if (kind === "reject") return call(api.POST("/api/v1/admin/onboarding/{applicationId}/reject", { params, body }));
      return call(api.POST("/api/v1/admin/onboarding/{applicationId}/request-corrections", { params, body }));
    });
    if (updated) setData(updated);
  };

  const person: [string, React.ReactNode][] = [
    [t("common.name"), app.fullName],
    [t("common.document"), app.documentType ? `${app.documentType} ${app.documentNumber ?? ""}` : null],
    [t("common.email"), app.email],
    [t("common.phone"), app.phone],
  ];
  if (app.role === "TRANSPORTER") {
    person.push([t("req.field.driverLicenseNumber"), app.driverLicenseNumber], [t("admin.onb.vehiclePlate"), app.vehiclePlate]);
  }
  const company: [string, React.ReactNode][] = [
    [t("onb.companyName"), app.companyName],
    [t("onb.ruc"), app.ruc],
    [t("onb.address"), app.companyAddress],
    [t("onb.legalRep"), app.legalRepresentative],
    [t("common.email"), app.email],
    [t("common.phone"), app.phone],
  ];

  return (
    <>
      <div>
        <Link href="/admin/onboarding" className="back">{t("common.back")}</Link>
        <header className="page-head">
          <div>
            <h1>{(app.role === "COLLECTOR" ? app.companyName : app.fullName) ?? app.phone}</h1>
            <p>{t(`role.${app.role}`)}, {t("admin.onb.submitted").toLowerCase()} {formatDateTime(app.submittedAt, locale)}</p>
          </div>
          <StatusTag status={app.status} />
        </header>
      </div>

      <div className="split">
        <div className="stack">
          <section className="panel">
            <h2>{t("admin.onb.details")}</h2>
            <Facts items={app.role === "COLLECTOR" ? company : person} />
          </section>
          <section className="panel stack">
            <h2>{t("admin.onb.documents")}</h2>
            {app.documents.length === 0 ? (
              <p className="muted">{t("common.none")}</p>
            ) : (
              <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
                {app.documents.map((d) => (
                  <li key={d.id}>
                    <strong>{t(`req.document.${d.kind}`)}</strong>{" "}
                    <FileButton fileId={d.fileId} label={d.fileName} />
                    <div className="muted">{formatDateTime(d.uploadedAt, locale)}</div>
                    <div className="hash">sha256 {d.sha256.slice(0, 16)}…</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="panel stack">
            <h2>{t("admin.onb.kyc")}</h2>
            <StatusTag status={app.kycStatus === "PASSED" ? "APPROVED" : app.kycStatus === "FAILED" ? "REJECTED" : "SUBMITTED"}
              label={t(`kyc.${app.kycStatus}`)} />
            {app.kycDetails && <p className="muted">{app.kycDetails}</p>}
          </section>
          {app.status === "SUBMITTED" ? (
            <section className="panel stack">
              <h2>{t("admin.onb.decision")}</h2>
              <p className="muted">{t("admin.onb.decisionHelp")}</p>
              <ErrorNotice error={action.error} />
              <DecisionForm
                noteLabel={t("common.notes")}
                pending={action.pending}
                actions={[
                  { label: t("admin.onb.approve"), variant: "good", onClick: decide("approve") },
                  { label: t("admin.onb.requestCorrections"), variant: "quiet", requiresNote: true, onClick: decide("request-corrections") },
                  { label: t("admin.onb.reject"), variant: "danger", requiresNote: true, onClick: decide("reject") },
                ]}
              />
            </section>
          ) : (
            app.reviewNotes && (
              <section className="panel">
                <h2>{t("common.notes")}</h2>
                <p>{app.reviewNotes}</p>
              </section>
            )
          )}
        </div>
      </div>
    </>
  );
}
