import { useState } from "react";
import { View } from "react-native";
import { Body, Button, ErrorNotice, Field, ListItem, Muted, Notice, Screen, Stamp, StatusTag } from "@/components/ui";
import { api, call, type Schemas } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useAction, useScreenData } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { space, type } from "@/lib/theme";

/** Payment proposals from the Collector/Plant: accept or dispute. PMD validates afterwards. */
export default function Payments() {
  const { t } = useI18n();
  const { data, error, loading, reload, staleSince } = useScreenData(() => call(api.GET("/api/v1/settlements")), "settlements");
  return (
    <Screen title={t("payments.title")} refreshing={loading} onRefresh={reload}>
      <ErrorNotice error={error} staleSince={staleSince} />
      {data && data.length === 0 && <Notice>{t("payments.empty")}</Notice>}
      {data?.map((s) => <Payment key={s.id} s={s} onChanged={reload} />)}
    </Screen>
  );
}

function Payment({ s, onChanged }: { s: Schemas["Settlement"]; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const action = useAction();
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const params = { path: { lotId: s.lotId } };
  const last = s.proposals[s.proposals.length - 1];

  const accept = () => action.run(async () => {
    await call(api.POST("/api/v1/lots/{lotId}/settlement/accept", { params }));
    onChanged();
  });
  const dispute = () => action.run(async () => {
    await call(api.POST("/api/v1/lots/{lotId}/settlement/dispute", { params, body: { reason } }));
    onChanged();
  });

  return (
    <ListItem>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Stamp>{s.lotCode}</Stamp>
        <StatusTag status={s.status} />
      </View>
      <Stamp size={type.title}>{formatMoney(s.amount, s.currency, locale)}</Stamp>
      {last?.pricePerGram != null && <Muted>{formatMoney(last.pricePerGram, s.currency, locale)} / g</Muted>}
      {last?.notes && <Muted>{last.notes}</Muted>}
      {s.adminNotes && <Muted>PMD: {s.adminNotes}</Muted>}
      {s.status === "PAID" && <Body>{t("payments.paidRef", { ref: s.paymentReference })}</Body>}
      <ErrorNotice error={action.error} />
      {s.status === "PROPOSED" && !disputing && (
        <View style={{ gap: space.md }}>
          <Button label={t("payments.accept")} variant="good" onPress={accept} busy={action.pending} />
          <Button label={t("payments.dispute")} variant="danger" onPress={() => setDisputing(true)} />
        </View>
      )}
      {s.status === "PROPOSED" && disputing && (
        <View style={{ gap: space.md }}>
          <Field label={t("payments.disputeReason")} value={reason} onChangeText={setReason} multiline />
          <Button label={t("payments.dispute")} variant="danger" onPress={dispute} disabled={!reason.trim()} busy={action.pending} />
          <Button label={t("common.cancel")} variant="quiet" onPress={() => setDisputing(false)} />
        </View>
      )}
    </ListItem>
  );
}
