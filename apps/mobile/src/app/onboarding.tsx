import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Body, Button, Choice, ErrorNotice, Field, Muted, Notice, Screen, Section, StatusTag } from "@/components/ui";
import { api, call, uploadMultipart, type Schemas } from "@/lib/api";
import { DOCUMENT_PHOTO_MAX_EDGE, takePhoto } from "@/lib/capture";
import { useAction } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { onboardingTag } from "@/lib/onboardingStatus";
import { useSession } from "@/lib/session";
import { space } from "@/lib/theme";

type Application = Schemas["OnboardingApplication"];
type DocKind = Schemas["DocumentKind"];

/** Miner / Transporter identity verification (personal data + ID, selfie or driver's license). */
export default function Onboarding() {
  const { onboarding, user } = useSession();
  if (!onboarding || !user) return <Screen><Muted>…</Muted></Screen>;
  return <OnboardingForm key={onboarding.id} app={onboarding} />;
}

const formFrom = (app: Application) => ({
  fullName: app.fullName ?? "",
  documentType: (app.documentType ?? "DNI") as "DNI" | "CE" | "PASSPORT",
  documentNumber: app.documentNumber ?? "",
  email: app.email ?? "",
  driverLicenseNumber: app.driverLicenseNumber ?? "",
  vehiclePlate: app.vehiclePlate ?? "",
});

function OnboardingForm({ app }: { app: Application }) {
  const { t } = useI18n();
  const { refresh, signOut, updateOnboarding } = useSession();
  // The person's edits, if any. Until they type, the fields show the application as it is now: the app
  // opens from the copy saved on the phone, and the server's newer copy can arrive a moment later.
  const [draft, setDraft] = useState<ReturnType<typeof formFrom> | null>(null);
  const form = draft ?? formFrom(app);
  const setForm = setDraft;
  const action = useAction();

  /** A new copy of the application from the server: shown at once, and kept for offline start-up. */
  const update = (latest: Application, saved = false) => {
    updateOnboarding(latest);
    if (saved) setDraft(null);
  };

  const editable = app.status === "DRAFT" || app.status === "CORRECTIONS_REQUESTED";
  const isTransporter = app.role === "TRANSPORTER";
  const docs: DocKind[] = isTransporter ? ["ID_DOCUMENT", "DRIVER_LICENSE"] : ["ID_DOCUMENT", "SELFIE"];
  const has = (kind: DocKind) => app.documents.some((d) => d.kind === kind);

  const body = () => ({
    fullName: form.fullName,
    documentType: form.documentType,
    documentNumber: form.documentNumber,
    email: form.email,
    ...(isTransporter ? { driverLicenseNumber: form.driverLicenseNumber, vehiclePlate: form.vehiclePlate } : {}),
  });

  const save = () => action.run(async () => update(await call(api.PUT("/api/v1/onboarding/me", { body: body() })), true));

  const capture = (kind: DocKind) =>
    action.run(async () => {
      // Documents keep more detail so their text can be read; a selfie needs only the face.
      const photo = await takePhoto(
        kind === "SELFIE" ? { front: true } : { maxEdge: DOCUMENT_PHOTO_MAX_EDGE },
      );
      if (!photo) return;
      await uploadMultipart("/api/v1/onboarding/me/documents", photo, { kind });
      update(await call(api.GET("/api/v1/onboarding/me")));
    });

  const submit = () =>
    action.run(async () => {
      // Only what the person typed is sent again; untouched fields are already on the server.
      if (draft) update(await call(api.PUT("/api/v1/onboarding/me", { body: body() })), true);
      update(await call(api.POST("/api/v1/onboarding/me/submit")));
    });

  const recheck = () =>
    action.run(async () => {
      const latest = await call(api.GET("/api/v1/onboarding/me"));
      update(latest);
      if (latest.status === "APPROVED") {
        await refresh();
        router.replace("/");
      }
    });

  const statusKind = app.status === "APPROVED" ? "good" : app.status === "REJECTED" || app.status === "CORRECTIONS_REQUESTED" ? "bad" : "wait";

  return (
    <Screen title={t("onb.title")} subtitle={t("onb.subtitle")}>
      <StatusTag status={onboardingTag(app.status)} />
      <Notice kind={statusKind}>
        <Body>
          {t(`onb.status.${app.status}`)} {app.reviewNotes && (app.status === "CORRECTIONS_REQUESTED" || app.status === "REJECTED") ? app.reviewNotes : ""}
        </Body>
      </Notice>
      <ErrorNotice error={action.error} />

      {app.status === "APPROVED" && <Button label={t("onb.continue")} onPress={recheck} busy={action.pending} />}
      {app.status === "SUBMITTED" && <Button label={t("onb.refresh")} variant="quiet" onPress={recheck} busy={action.pending} />}

      {editable && (
        <>
          <Section>
            <Field label={t("onb.fullName")} value={form.fullName} onChangeText={(v) => setForm({ ...form, fullName: v })}
              autoCapitalize="words" />
            <Choice
              label={t("onb.documentType")}
              value={form.documentType}
              options={[{ value: "DNI", label: "DNI" }, { value: "CE", label: "CE" }, { value: "PASSPORT", label: t("onb.passport") }]}
              onChange={(v) => setForm({ ...form, documentType: v })}
            />
            <Field label={t("onb.documentNumber")} value={form.documentNumber}
              onChangeText={(v) => setForm({ ...form, documentNumber: v.trim() })}
              keyboardType={form.documentType === "DNI" ? "number-pad" : "default"} autoCapitalize="characters" />
            <Field label={t("onb.email")} value={form.email} onChangeText={(v) => setForm({ ...form, email: v.trim() })}
              keyboardType="email-address" autoCapitalize="none" />
            {isTransporter && (
              <>
                <Field label={t("onb.driverLicense")} value={form.driverLicenseNumber}
                  onChangeText={(v) => setForm({ ...form, driverLicenseNumber: v })} autoCapitalize="characters" />
                <Field label={t("onb.vehiclePlate")} value={form.vehiclePlate}
                  onChangeText={(v) => setForm({ ...form, vehiclePlate: v })} autoCapitalize="characters" />
              </>
            )}
            <Button label={t("common.save")} variant="quiet" onPress={save} busy={action.pending} />
          </Section>

          <Section title={t("onb.documents")}>
            {docs.map((kind) => (
              <View key={kind} style={{ gap: space.sm }}>
                <Body bold>{t(`req.document.${kind}`)}</Body>
                {has(kind) && <StatusTag status="APPROVED" label={t("onb.uploaded")} />}
                <Button label={has(kind) ? t("onb.retake") : t("onb.takePhoto")} variant={has(kind) ? "quiet" : "primary"}
                  onPress={() => capture(kind)} busy={action.pending} />
              </View>
            ))}
          </Section>

          {app.missingRequirements.length > 0 && (
            <Notice kind="wait">
              <Body bold>{t("onb.missing")}</Body>
              {app.missingRequirements.map((m) => <Muted key={m}>• {t(`req.${m}`)}</Muted>)}
            </Notice>
          )}
          <Button label={t("onb.submit")} onPress={submit} busy={action.pending} />
        </>
      )}
      <Button label={t("profile.signOut")} variant="quiet" onPress={() => signOut().then(() => router.replace("/login"))} />
    </Screen>
  );
}
