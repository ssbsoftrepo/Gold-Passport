import { router } from "expo-router";
import { View } from "react-native";
import { Button, ErrorNotice, ListItem, Muted, Notice, Screen, Stamp, StatusTag } from "@/components/ui";
import { api, call } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useScreenData } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { space } from "@/lib/theme";

export default function MinerLots() {
  const { t, locale } = useI18n();
  const { data, error, loading, reload } = useScreenData(() => call(api.GET("/api/v1/lots", {})));
  const mine = data ?? [];

  return (
    <Screen title={t("lots.title")} refreshing={loading} onRefresh={reload}>
      <Button label={t("lots.new")} onPress={() => router.push("/lot/new")} />
      <ErrorNotice error={error} />
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
