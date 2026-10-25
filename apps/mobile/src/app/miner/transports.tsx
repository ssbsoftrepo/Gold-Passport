import { useState } from "react";
import { View } from "react-native";
import { Body, Button, Choice, ErrorNotice, Field, ListItem, Muted, Notice, Screen, Stamp, StatusTag } from "@/components/ui";
import { api, call, type Schemas } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useAction, useScreenData } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useOutbox } from "@/lib/outbox";
import { space } from "@/lib/theme";

/** Transport requests addressed to the miner: confirm with a lot, decline, hand over at the mine. */
export default function MinerTransports() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useScreenData(async () => {
    const [transports, ready] = await Promise.all([
      call(api.GET("/api/v1/transports", {})),
      call(api.GET("/api/v1/lots", { params: { query: { status: "READY_FOR_TRANSPORT" } } })),
    ]);
    return { transports, ready };
  });

  return (
    <Screen title={t("transports.title")} refreshing={loading} onRefresh={reload}>
      <ErrorNotice error={error} />
      {data && data.transports.length === 0 && <Notice>{t("transports.empty")}</Notice>}
      {data?.transports.map((tr) => <TransportRequest key={tr.id} tr={tr} readyLots={data.ready} onChanged={reload} />)}
    </Screen>
  );
}

function TransportRequest({ tr, readyLots, onChanged }: { tr: Schemas["Transport"]; readyLots: Schemas["Lot"][]; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const outbox = useOutbox();
  const action = useAction();
  const [lotId, setLotId] = useState<string | null>(readyLots[0]?.id ?? null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [queued, setQueued] = useState(false);
  const params = { path: { transportId: tr.id } };

  const confirm = () =>
    action.run(async () => {
      if (!lotId) return;
      await call(api.POST("/api/v1/transports/{transportId}/miner-confirm", { params, body: { lotId } }));
      onChanged();
    });
  const decline = () =>
    action.run(async () => {
      await call(api.POST("/api/v1/transports/{transportId}/decline", { params, body: { reason } }));
      onChanged();
    });
  const handover = () =>
    action.run(async () => {
      const r = await outbox.submit({ kind: "json", path: `/api/v1/transports/${tr.id}/handover`, body: undefined },
        { label: `${tr.code}: ${t("transports.handover")}`, scope: `transport:${tr.id}` });
      setQueued(r.status === "queued");
      if (r.status === "sent") onChanged();
    });

  const awaitingMe = tr.status === "PENDING_CONFIRMATION" && !tr.minerConfirmedAt;

  return (
    <ListItem>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Stamp>{tr.code}</Stamp>
        <StatusTag status={tr.status} />
      </View>
      <Body>{t("transports.requestFor", { name: tr.transporterName ?? "—" })}</Body>
      <Muted>
        {t("transport.collector")}: {tr.collectorName ?? "—"}
        {tr.plannedPickupDate ? `, ${t("transport.planned").toLowerCase()} ${formatDate(tr.plannedPickupDate, locale)}` : ""}
      </Muted>
      {tr.lotCode && <Muted>{t("transport.lot")}: {tr.lotCode}</Muted>}
      <ErrorNotice error={action.error} />
      {queued && <Notice kind="wait">{t("common.offlineSaved")}</Notice>}

      {awaitingMe && !declining && (
        <View style={{ gap: space.md }}>
          {readyLots.length === 0 ? (
            <Notice kind="wait">{t("transports.noReadyLots")}</Notice>
          ) : (
            <Choice label={t("transports.chooseLot")} value={lotId}
              options={readyLots.map((l) => ({ value: l.id, label: l.code }))} onChange={setLotId} />
          )}
          <Button label={t("transports.confirm")} onPress={confirm} disabled={!lotId} busy={action.pending} />
          <Button label={t("transports.decline")} variant="danger" onPress={() => setDeclining(true)} />
        </View>
      )}
      {awaitingMe && declining && (
        <View style={{ gap: space.md }}>
          <Field label={t("transports.declineReason")} value={reason} onChangeText={setReason} multiline />
          <Button label={t("transports.decline")} variant="danger" onPress={decline} disabled={!reason.trim()} busy={action.pending} />
          <Button label={t("common.cancel")} variant="quiet" onPress={() => setDeclining(false)} />
        </View>
      )}
      {tr.status === "AT_MINER" && !tr.handoverConfirmedAt && !queued && (
        <View style={{ gap: space.sm }}>
          <Muted>{t("transports.handoverHelp")}</Muted>
          <Button label={t("transports.handover")} variant="good" onPress={handover} busy={action.pending} />
        </View>
      )}
      {tr.handoverConfirmedAt && <StatusTag status="APPROVED" label={t("transports.handoverDone")} />}
    </ListItem>
  );
}
