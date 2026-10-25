import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Body, Button, Choice, ErrorNotice, Field, Muted, Notice, Screen, Section, StatusTag } from "@/components/ui";
import { api, call, uploadMultipart, type Schemas } from "@/lib/api";
import { takePhoto } from "@/lib/capture";
import { useAction } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { space } from "@/lib/theme";

type Application = Schemas["OnboardingApplication"];
type DocKind = Schemas["DocumentKind"];

/** Miner / Transporter identity verification (personal data + ID, selfie or driver's license). */
export default function Onboarding() {
  const { onboarding, user } = useSession();
  if (!onboarding || !user) return <Screen><Muted>…</Muted></Screen>;
  return <OnboardingForm key={onboarding.id} initial={onboarding} />;
}

function OnboardingForm({ initial }: { initial: Application }) {
  const { t } = useI18n();
  const { refresh, signOut } = useSession();
  const [app, setApp] = useState(initial);
  const [form, setForm] = useState({
    fullName: initial.fullName ?? "",
    documentType: (initial.documentType ?? "DNI") as "DNI" | "CE" | "PASSPORT",
    documentNumber: initial.documentNumber ?? "",
    email: initial.email ?? "",
    driverLicenseNumber: initial.driverLicenseNumber ?? "",
    vehiclePlate: initial.vehiclePlate ?? "",
  });
  const action = useAction();

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

  const save = () => action.run(async () => setApp(await call(api.PUT("/api/v1/onboarding/me", { body: body() }))));

  const capture = (kind: DocKind) =>
    action.run(async () => {
      const photo = await takePhoto(kind === "SELFIE");
      if (!photo) return;
      await uploadMultipart("/api/v1/onboarding/me/documents", photo, { kind });
      setApp(await call(api.GET("/api/v1/onboarding/me")));
    });

  const submit = () =>
    action.run(async () => {
      await call(api.PUT("/api/v1/onboarding/me", { body: body() }));
      setApp(await call(api.POST("/api/v1/onboarding/me/submit")));
    });

  const recheck = () =>
    action.run(async () => {
      const latest = await call(api.GET("/api/v1/onboarding/me"));
      setApp(latest);
      if (latest.status === "APPROVED") {
        await refresh();
        router.replace("/");
      }
    });

  const statusKind = app.status === "APPROVED" ? "good" : app.status === "REJECTED" || app.status === "CORRECTIONS_REQUESTED" ? "bad" : "wait";

  return (
    <Screen title={t("onb.title")} subtitle={t("onb.subtitle")}>
      <StatusTag status={app.status === "SUBMITTED" ? "PENDING_REVIEW" : app.status === "CORRECTIONS_REQUESTED" ? "CLARIFICATION_REQUESTED" : app.status} />
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
