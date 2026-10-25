import { router } from "expo-router";
import { useState } from "react";
import { Button, Choice, ErrorNotice, Field, Notice, Screen, Section } from "@/components/ui";
import { api, call } from "@/lib/api";
import { useAction, useScreenData } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

/** New transport request between a Miner and a Collector/Plant the transporter is approved with. */
export default function NewTransport() {
  const { t } = useI18n();
  const action = useAction();
  const { data, error } = useScreenData(() => call(api.GET("/api/v1/relationships")));
  const [minerUserId, setMiner] = useState<string | null>(null);
  const [collectorUserId, setCollector] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");

  const approved = (data ?? []).filter((r) => r.status === "APPROVED");
  const partner = (role: "MINER" | "COLLECTOR") =>
    approved
      .map((r) =>
        r.ownerRole === "TRANSPORTER"
          ? r.counterpartyRole === role && r.counterpartyUserId ? { value: r.counterpartyUserId, label: r.entityName } : null
          : r.ownerRole === role ? { value: r.ownerUserId, label: r.ownerName ?? r.entityName } : null,
      )
      .filter((x): x is { value: string; label: string } => x !== null);
  const miners = partner("MINER");
  const collectors = partner("COLLECTOR");

  const submit = () =>
    action.run(async () => {
      if (!minerUserId || !collectorUserId) return;
      const tr = await call(
        api.POST("/api/v1/transports", {
          body: {
            minerUserId,
            collectorUserId,
            plannedPickupDate: /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) ? date.trim() : null,
            notes: notes.trim() || null,
          },
        }),
      );
      router.replace({ pathname: "/transport/[transportId]", params: { transportId: tr.id } });
    });

  return (
    <Screen>
      <ErrorNotice error={error ?? action.error} />
      {data && (miners.length === 0 || collectors.length === 0) && <Notice kind="wait">{t("transport.needPartners")}</Notice>}
      <Section>
        <Choice label={t("transport.chooseMiner")} value={minerUserId} options={miners} onChange={setMiner} />
        <Choice label={t("transport.chooseCollector")} value={collectorUserId} options={collectors} onChange={setCollector} />
        <Field label={t("transport.date")} value={date} onChangeText={setDate} placeholder="2026-10-24" />
        <Field label={t("common.notes")} value={notes} onChangeText={setNotes} multiline />
        <Button label={t("transport.request")} onPress={submit} busy={action.pending} disabled={!minerUserId || !collectorUserId} />
      </Section>
    </Screen>
  );
}
