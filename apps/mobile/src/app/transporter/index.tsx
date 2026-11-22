import { router } from "expo-router";
import { View } from "react-native";
import { ComingSoon } from "@/components/ComingSoon";
import { Button, ErrorNotice, ListItem, Muted, Notice, Screen, Stamp, StatusTag } from "@/components/ui";
import { api, call } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useScreenData } from "@/lib/hooks";
import { isEnabled } from "@/lib/features";
import { useI18n } from "@/lib/i18n";
import { space } from "@/lib/theme";

/** Trips are released in phase 3; before that an approved transporter sees what is coming. */
export default function TransporterHome() {
  return isEnabled("transport") ? <Trips /> : <ComingSoon />;
}

function Trips() {
  const { t, locale } = useI18n();
  const { data, error, loading, reload, staleSince } = useScreenData(() => call(api.GET("/api/v1/transports", {})), "transports");
  return (
    <Screen title={t("transports.title")} refreshing={loading} onRefresh={reload}>
      <Button label={t("transports.new")} onPress={() => router.push("/transport/new")} />
      <ErrorNotice error={error} staleSince={staleSince} />
      {data && data.length === 0 && <Notice>{t("transports.empty")}</Notice>}
      {data?.map((tr) => (
        <ListItem key={tr.id} onPress={() => router.push({ pathname: "/transport/[transportId]", params: { transportId: tr.id } })}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm }}>
            <Stamp>{tr.code}</Stamp>
            <StatusTag status={tr.status} />
          </View>
          <Muted>
            {tr.minerName ?? "—"} → {tr.collectorName ?? "—"}
          </Muted>
          <Muted>
            {tr.lotCode ?? "—"}
            {tr.plannedPickupDate ? `, ${formatDate(tr.plannedPickupDate, locale)}` : ""}
          </Muted>
        </ListItem>
      ))}
    </Screen>
  );
}
