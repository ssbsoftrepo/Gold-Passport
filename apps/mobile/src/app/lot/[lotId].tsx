import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { PendingBanner } from "@/components/TabsLayout";
import { Body, Button, ErrorNotice, Field, Muted, Notice, Row, Screen, Section, Stamp, StatusTag } from "@/components/ui";
import { api, call, uploadMultipart, type Schemas, type UploadFile } from "@/lib/api";
import { pickDocument, takePhoto } from "@/lib/capture";
import { formatDateTime, formatNumber, parseDecimal } from "@/lib/format";
import { useAction, useScreenData } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { currentReading } from "@/lib/location";
import { useOutbox } from "@/lib/outbox";
import { space, type } from "@/lib/theme";

/** Miner's lote: extraction photos with GPS (works offline), close, then declare the lab assay. */
export default function LotDetail() {
  const { lotId } = useLocalSearchParams<{ lotId: string }>();
  const { t, locale } = useI18n();
  const outbox = useOutbox();
  const { data: lot, error, loading, reload, setData, staleSince } = useScreenData(
    () => call(api.GET("/api/v1/lots/{lotId}", { params: { path: { lotId } } })),
    `lot:${lotId}`,
  );
  const action = useAction();
  const [queued, setQueued] = useState(false);
  const [lab, setLab] = useState({ labName: "", purity: "", weight: "" });
  const [report, setReport] = useState<UploadFile | null>(null);

  if (!lot) {
    return (
      <Screen refreshing={loading} onRefresh={reload}>
        <ErrorNotice error={error} />
      </Screen>
    );
  }

  const addPhoto = () =>
    action.run(async () => {
      const photo = await takePhoto();
      if (!photo) return;
      // Capture the position right after the shot; GPS works without mobile data.
      const reading = await currentReading();
      const fields: Record<string, string> = {
        latitude: String(reading.latitude),
        longitude: String(reading.longitude),
        capturedAt: new Date().toISOString(),
      };
      if (reading.accuracyMeters !== null) fields.accuracyMeters = String(reading.accuracyMeters);
      const result = await outbox.submit(
        { kind: "upload", path: `/api/v1/lots/${lot.id}/photos`, fileUri: photo.uri, fileName: photo.name, mimeType: photo.type, fields },
        { label: `${lot.code}: ${t("lot.addPhoto")}`, scope: `lot:${lot.id}` },
      );
      setQueued(result.status === "queued");
      if (result.status === "sent") await reload();
    });

  const complete = () =>
    action.run(async () => setData(await call(api.POST("/api/v1/lots/{lotId}/complete", { params: { path: { lotId } } }))));

  const saveLab = () =>
    action.run(async () => {
      if (!report) return;
      const updated = await uploadMultipart<Schemas["Lot"]>(`/api/v1/lots/${lot.id}/miner-lab-result`, report, {
        labName: lab.labName.trim(),
        purityPct: String(parseDecimal(lab.purity)),
        weightGrams: String(parseDecimal(lab.weight)),
      });
      setData(updated);
    });

  const canEditLab = lot.status === "COMPLETED" || lot.status === "READY_FOR_TRANSPORT";
  const pct = (v: number | null) => (v === null ? "—" : t("common.percent", { value: formatNumber(v, locale) }));
  const g = (v: number | null) => (v === null ? "—" : t("common.grams", { value: formatNumber(v, locale) }));

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <View style={{ gap: space.sm }}>
        <Stamp size={type.hero}>{lot.code}</Stamp>
        <StatusTag status={lot.status} />
        <Muted>{t("lot.passportHint")}</Muted>
      </View>
      <ErrorNotice error={action.error ?? error} staleSince={action.error ? null : staleSince} />
      {queued && <Notice kind="wait">{t("common.offlineSaved")}</Notice>}
      <PendingBanner scope={`lot:${lot.id}`} />

      <Section>
        <Row label={t("lots.site")} value={lot.mineSiteName} />
        <Row label={t("lot.custodian")} value={t(`role.${lot.custodianRole}`)} />
        <Row label={`${t("lot.declared")}: ${t("lot.purity")}`} value={pct(lot.declaredPurityPct)} />
        <Row label={`${t("lot.declared")}: ${t("lot.weight")}`} value={g(lot.declaredWeightGrams)} />
        {lot.verifiedPurityPct !== null && <Row label={`${t("lot.verified")}: ${t("lot.purity")}`} value={pct(lot.verifiedPurityPct)} />}
        {lot.verifiedWeightGrams !== null && <Row label={`${t("lot.verified")}: ${t("lot.weight")}`} value={g(lot.verifiedWeightGrams)} />}
      </Section>

      <Section title={t("lot.photos")}>
        <Muted>{t("lot.photosHelp")}</Muted>
        {lot.evidence.map((e, i) => (
          <View key={e.id} style={{ gap: 2 }}>
            <Body bold>{t("lot.photoN", { n: i + 1 })}</Body>
            <Muted>
              {e.latitude.toFixed(5)}, {e.longitude.toFixed(5)}
              {e.accuracyMeters !== null ? ` ±${Math.round(e.accuracyMeters)} m` : ""}
            </Muted>
            <Muted>{formatDateTime(e.capturedAt ?? e.receivedAt, locale)}</Muted>
          </View>
        ))}
        {lot.status === "OPEN" && (
          <>
            <Button label={t("lot.addPhoto")} onPress={addPhoto} busy={action.pending} />
            <Muted>{t("lot.completeHelp")}</Muted>
            <Button label={t("lot.complete")} variant="quiet" onPress={complete} disabled={lot.evidence.length === 0}
              busy={action.pending} />
          </>
        )}
      </Section>

      {canEditLab && (
        <Section title={t("lot.labTitle")}>
          <Muted>{t("lot.labHelp")}</Muted>
          <Field label={t("lot.labName")} value={lab.labName} onChangeText={(v) => setLab({ ...lab, labName: v })} />
          <Field label={t("lot.purity")} value={lab.purity} onChangeText={(v) => setLab({ ...lab, purity: v })}
            keyboardType="decimal-pad" />
          <Field label={t("lot.weight")} value={lab.weight} onChangeText={(v) => setLab({ ...lab, weight: v })}
            keyboardType="decimal-pad" />
          <Button label={report ? `${t("lot.report")}: ${report.name}` : t("lot.pickReport")} variant="quiet"
            onPress={() => action.run(async () => setReport(await pickDocument()))} />
          <Button label={t("lot.saveLab")} onPress={saveLab} busy={action.pending}
            disabled={!report || !lab.labName.trim() || !lab.purity || !lab.weight} />
        </Section>
      )}
    </Screen>
  );
}
