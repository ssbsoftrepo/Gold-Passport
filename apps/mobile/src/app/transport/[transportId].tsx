import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Body, Button, ErrorNotice, Field, Muted, Notice, Row, Screen, Section, Stamp, StatusTag } from "@/components/ui";
import { api, call } from "@/lib/api";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { useAction, useScreenData } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { currentReading } from "@/lib/location";
import { useOutbox } from "@/lib/outbox";
import { space, type } from "@/lib/theme";

type GpsStep = "depart" | "arrive-at-miner" | "pickup" | "location" | "arrive-at-collector";

/**
 * The transporter's journey. Each step records GPS and is queued offline if there is no signal;
 * the backend enforces the order and the hand-off rules.
 */
export default function TransportDetail() {
  const { transportId } = useLocalSearchParams<{ transportId: string }>();
  const { t, locale } = useI18n();
  const outbox = useOutbox();
  const action = useAction();
  const [queued, setQueued] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const { data: tr, error, loading, reload, setData, staleSince } = useScreenData(
    () => call(api.GET("/api/v1/transports/{transportId}", { params: { path: { transportId } } })),
    `transport:${transportId}`,
  );

  if (!tr) {
    return (
      <Screen refreshing={loading} onRefresh={reload}>
        <ErrorNotice error={error} />
      </Screen>
    );
  }

  const pendingHere = outbox.items.some((i) => i.scope === `transport:${tr.id}` && !i.error);

  const gpsStep = (step: GpsStep, label: string) =>
    action.run(async () => {
      const reading = await currentReading();
      const r = await outbox.submit({ kind: "json", path: `/api/v1/transports/${tr.id}/${step}`, body: reading },
        { label: `${tr.code}: ${label}`, scope: `transport:${tr.id}` });
      setQueued(r.status === "queued");
      if (r.status === "sent") await reload();
    });

  const finalize = () =>
    action.run(async () => setData(await call(api.POST("/api/v1/transports/{transportId}/finalize", { params: { path: { transportId } } }))));

  const cancel = () =>
    action.run(async () => {
      setData(await call(api.POST("/api/v1/transports/{transportId}/cancel", { params: { path: { transportId } }, body: { reason } })));
      setCancelling(false);
    });

  const amend = () =>
    action.run(async () =>
      setData(
        await call(
          api.PUT("/api/v1/transports/{transportId}", {
            params: { path: { transportId } },
            body: { minerUserId: tr.minerUserId, collectorUserId: tr.collectorUserId, plannedPickupDate: tr.plannedPickupDate, notes: tr.notes },
          }),
        ),
      ),
    );

  const cancellable = ["PENDING_CONFIRMATION", "DECLINED", "CONFIRMED", "EN_ROUTE_TO_MINER", "AT_MINER"].includes(tr.status);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <View style={{ gap: space.sm }}>
        <Stamp size={type.hero}>{tr.code}</Stamp>
        <StatusTag status={tr.status} />
      </View>
      <ErrorNotice error={action.error ?? error} staleSince={action.error ? null : staleSince} />
      {(queued || pendingHere) && <Notice kind="wait">{t("common.offlineSaved")}</Notice>}

      <Section>
        <Row label={t("transport.miner")} value={tr.minerName ?? "—"} />
        <Row label={t("transport.collector")} value={tr.collectorName ?? "—"} />
        <Row label={t("transport.lot")} value={tr.lotCode ?? "—"} />
        <Row label={t("transport.planned")} value={formatDate(tr.plannedPickupDate, locale)} />
        {tr.minerConfirmedAt && <Muted>✓ {t("transport.minerConfirmed")}</Muted>}
        {tr.collectorConfirmedAt && <Muted>✓ {t("transport.collectorConfirmed")}</Muted>}
      </Section>

      {tr.status === "DECLINED" && (
        <Section>
          <Notice kind="bad">{t("transport.declinedBy", { reason: tr.declineReason ?? "" })}</Notice>
          <Button label={t("transport.amend")} onPress={amend} busy={action.pending} />
        </Section>
      )}

      {!pendingHere && (
        <Section>
          {tr.status === "CONFIRMED" && (
            <Button label={t("transport.depart")} onPress={() => gpsStep("depart", t("transport.depart"))} busy={action.pending} />
          )}
          {tr.status === "EN_ROUTE_TO_MINER" && (
            <>
              <Button label={t("transport.arriveMiner")} onPress={() => gpsStep("arrive-at-miner", t("transport.arriveMiner"))} busy={action.pending} />
              <Button label={t("transport.ping")} variant="quiet" onPress={() => gpsStep("location", t("transport.ping"))} />
            </>
          )}
          {tr.status === "AT_MINER" && (
            <>
              {tr.locationMismatch && tr.arrivalDistanceKm !== null && (
                <Notice kind="bad">{t("transport.mismatch", { km: formatNumber(tr.arrivalDistanceKm, locale) })}</Notice>
              )}
              <Muted>{tr.pickupApprovedAt ? "✓" : "…"} {t("transport.pickupApproved")}</Muted>
              <Muted>{tr.handoverConfirmedAt ? "✓" : "…"} {t("transport.handover")}</Muted>
              {!(tr.pickupApprovedAt && tr.handoverConfirmedAt) && <Muted>{t("transport.pickupNeeds")}</Muted>}
              <Button label={t("transport.pickup")} variant="good" onPress={() => gpsStep("pickup", t("transport.pickup"))}
                disabled={!tr.pickupApprovedAt || !tr.handoverConfirmedAt} busy={action.pending} />
            </>
          )}
          {tr.status === "IN_TRANSIT" && (
            <>
              <Button label={t("transport.arriveCollector")} onPress={() => gpsStep("arrive-at-collector", t("transport.arriveCollector"))} busy={action.pending} />
              <Button label={t("transport.ping")} variant="quiet" onPress={() => gpsStep("location", t("transport.ping"))} />
            </>
          )}
          {tr.status === "ARRIVED_AT_COLLECTOR" && <Body>{t("transport.waitReceive")}</Body>}
          {tr.status === "DELIVERED" && <Button label={t("transport.finalize")} onPress={finalize} busy={action.pending} />}
          {tr.status === "PENDING_CONFIRMATION" && <Muted>{t("status.PENDING_CONFIRMATION")}</Muted>}
        </Section>
      )}

      {tr.checkpoints.length > 0 && (
        <Section>
          {tr.checkpoints.map((c) => (
            <View key={c.id}>
              <Body bold>{t(`checkpoint.${c.type}`)}</Body>
              <Muted>
                {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}, {formatDateTime(c.recordedAt, locale)}
              </Muted>
            </View>
          ))}
        </Section>
      )}

      {cancellable && !cancelling && (
        <Button label={t("transport.cancel")} variant="danger" onPress={() => setCancelling(true)} />
      )}
      {cancelling && (
        <Section>
          <Field label={t("common.reason")} value={reason} onChangeText={setReason} multiline />
          <Button label={t("transport.cancel")} variant="danger" onPress={cancel} disabled={!reason.trim()} busy={action.pending} />
          <Button label={t("common.cancel")} variant="quiet" onPress={() => setCancelling(false)} />
        </Section>
      )}
      {tr.status === "COMPLETED" && <Button label={t("transports.title")} variant="quiet" onPress={() => router.back()} />}
    </Screen>
  );
}
