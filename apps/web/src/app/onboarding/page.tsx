"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorNotice, FileButton, Loading, StatusTag } from "@/components/ui";
import { api, call, upload, type Schemas } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAction, useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

type Application = Schemas["OnboardingApplication"];

/** Collector/Plant registration (Miners and Transporters onboard in the mobile app). */
export default function OnboardingPage() {
  const { status, user, refreshUser, signOut } = useSession();
  const { t } = useI18n();
  const router = useRouter();
  const action = useAction();

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
    if (status === "authenticated" && user?.role === "ADMIN") router.replace("/admin");
    if (status === "authenticated" && (user?.role === "MINER" || user?.role === "TRANSPORTER")) router.replace("/field-app");
  }, [status, user, router]);

  if (status !== "authenticated" || !user) return <Loading />;

  if (user.role === null) {
    return (
      <main className="main">
        <div className="page" style={{ maxWidth: 640 }}>
          <h1>{t("role.pick.title")}</h1>
          <ErrorNotice error={action.error} />
          <div className="panel stack">
            <h2>{t("role.pick.collector")}</h2>
            <p>{t("role.pick.collectorHelp")}</p>
            <div>
              <button
                className="btn"
                disabled={action.pending}
                onClick={() =>
                  action.run(async () => {
                    await call(api.PUT("/api/v1/me/role", { body: { role: "COLLECTOR" } }));
                    await refreshUser();
                  })
                }
              >
                {t("role.pick.continue")}
              </button>
            </div>
          </div>
          <p className="muted">{t("role.pick.field")}</p>
          <button className="link-button" onClick={signOut}>
            {t("common.signOut")}
          </button>
        </div>
      </main>
    );
  }

  return user.role === "COLLECTOR" ? <CompanyRegistration /> : <Loading />;
}

function CompanyRegistration() {
  const { data: app, error, loading, reload, setData } = useLoad(() => call(api.GET("/api/v1/onboarding/me")));
  if (loading && !app) return <main className="main"><Loading /></main>;
  if (!app) return <main className="main"><ErrorNotice error={error} onRetry={reload} /></main>;
  return <CompanyForm key={app.id} app={app} onChange={setData} reload={reload} />;
}

function CompanyForm({ app, onChange, reload }: { app: Application; onChange: (a: Application) => void; reload: () => Promise<void> }) {
  const { t, locale } = useI18n();
  const save = useAction();
  const [form, setForm] = useState({
    companyName: app.companyName ?? "",
    ruc: app.ruc ?? "",
    companyAddress: app.companyAddress ?? "",
    legalRepresentative: app.legalRepresentative ?? "",
    email: app.email ?? "",
  });
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<typeof form>) => {
    setSaved(false);
    setForm({ ...form, ...patch });
  };
  const editable = app.status === "DRAFT" || app.status === "CORRECTIONS_REQUESTED";
  const legalDocs = app.documents.filter((d) => d.kind === "COMPANY_LEGAL_DOCUMENT");

  async function saveForm(e: React.FormEvent) {
    e.preventDefault();
    const updated = await save.run(() => call(api.PUT("/api/v1/onboarding/me", { body: form })));
    if (updated) {
      onChange(updated);
      setSaved(true);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.append("kind", "COMPANY_LEGAL_DOCUMENT");
    fd.append("file", file);
    const doc = await save.run(() => upload<Schemas["OnboardingDocument"]>("/api/v1/onboarding/me/documents", fd));
    if (doc) await reload();
  }

  async function submit() {
    const updated = await save.run(async () => {
      await call(api.PUT("/api/v1/onboarding/me", { body: form }));
      return call(api.POST("/api/v1/onboarding/me/submit"));
    });
    if (updated) onChange(updated);
  }

  return (
    <main className="main">
      <div className="page" style={{ maxWidth: 880 }}>
        <header className="page-head">
          <div>
            <h1>{t("onb.title")}</h1>
            <p>{t("onb.subtitle")}</p>
          </div>
          <StatusTag status={app.status} />
        </header>

        <StatusNotice app={app} />
        <ErrorNotice error={save.error} />

        <form className="panel stack" onSubmit={saveForm}>
          <div className="form-grid">
            <Field label={t("onb.companyName")} value={form.companyName} disabled={!editable}
              onChange={(v) => update({ companyName: v })} />
            <Field label={t("onb.ruc")} value={form.ruc} disabled={!editable} inputMode="numeric" maxLength={11}
              onChange={(v) => update({ ruc: v.replace(/\D/g, "") })} />
            <Field label={t("onb.address")} value={form.companyAddress} disabled={!editable}
              onChange={(v) => update({ companyAddress: v })} />
            <Field label={t("onb.legalRep")} value={form.legalRepresentative} disabled={!editable}
              onChange={(v) => update({ legalRepresentative: v })} />
            <Field label={t("onb.contactEmail")} value={form.email} disabled={!editable} type="email"
              onChange={(v) => update({ email: v })} />
          </div>
          {editable && (
            <div className="row">
              <button className="btn btn-quiet" disabled={save.pending}>{t("common.save")}</button>
              {saved && <span className="muted">{t("common.saved")}</span>}
            </div>
          )}
        </form>

        <section className="panel stack">
          <h2>{t("onb.legalDocs")}</h2>
          <p className="muted">{t("onb.legalDocsHelp")}</p>
          {legalDocs.length > 0 && (
            <ul>
              {legalDocs.map((d) => (
                <li key={d.id}>
                  <FileButton fileId={d.fileId} label={d.fileName} />{" "}
                  <span className="muted">{formatDateTime(d.uploadedAt, locale)}</span>
                </li>
              ))}
            </ul>
          )}
          {editable && (
            <label className="field">
              {t("onb.uploadDoc")}
              <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          )}
        </section>

        {editable && (
          <section className="stack">
            {app.missingRequirements.length > 0 && (
              <div className="notice notice-wait">
                <strong>{t("onb.missing")}</strong>
                <ul>
                  {app.missingRequirements.map((m) => (
                    <li key={m}>{t(`req.${m}`)}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <button className="btn" onClick={submit} disabled={save.pending}>
                {t("onb.submit")}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function StatusNotice({ app }: { app: Application }) {
  const { t } = useI18n();
  const tone =
    app.status === "APPROVED" ? "notice-good" : app.status === "REJECTED" || app.status === "CORRECTIONS_REQUESTED" ? "notice-bad" : "notice-wait";
  return (
    <div className={`notice ${tone} stack`}>
      <span>
        {t(`onb.status.${app.status}`)} {app.reviewNotes && (app.status === "CORRECTIONS_REQUESTED" || app.status === "REJECTED") ? app.reviewNotes : ""}
      </span>
      {app.status === "APPROVED" && (
        <Link className="btn" href="/collector" style={{ alignSelf: "flex-start", textDecoration: "none" }}>
          {t("onb.goToPortal")}
        </Link>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  type = "text",
  inputMode,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
}) {
  return (
    <label className="field">
      {label}
      <input type={type} value={value} disabled={disabled} inputMode={inputMode} maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
