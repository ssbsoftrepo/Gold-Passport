import { router } from "expo-router";
import { View } from "react-native";
import { ComingSoon } from "@/components/ComingSoon";
import { Button, ErrorNotice, ListItem, Muted, Notice, Screen, Stamp, StatusTag } from "@/components/ui";
import { api, call } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useScreenData } from "@/lib/hooks";
import { isEnabled } from "@/lib/features";
import { useI18n } from "@/lib/i18n";
import { space } from "@/lib/theme";

/** Batches are released in phase 2; before that an approved miner sees what is coming. */
export default function MinerHome() {
  return isEnabled("batches") ? <MinerLots /> : <ComingSoon />;
}

function MinerLots() {
  const { t, locale } = useI18n();
  const { data, error, loading, reload, staleSince } = useScreenData(() => call(api.GET("/api/v1/lots", {})), "lots");
  const mine = data ?? [];

  return (
    <Screen title={t("lots.title")} refreshing={loading} onRefresh={reload}>
      <Button label={t("lots.new")} onPress={() => router.push("/lot/new")} />
      <ErrorNotice error={error} staleSince={staleSince} />
      {data && mine.length === 0 && <Notice>{t("lots.empty")}</Notice>}
      {mine.map((lot) => (
        <ListItem key={lot.id} onPress={() => router.push({ pathname: "/lot/[lotId]", params: { lotId: lot.id } })}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm }}>
            <Stamp>{lot.code}</Stamp>
            <StatusTag status={lot.status} />
          </View>
          <Muted>
            {lot.mineSiteName}, {t("lot.photoCount", { n: lot.evidence.length })}, {formatDateTime(lot.updatedAt, locale)}
          </Muted>
        </ListItem>
      ))}
    </Screen>
  );
}
