import { router } from "expo-router";
import { View } from "react-native";
import { Body, Button, ErrorNotice, ListItem, Muted, Notice, Screen, StatusTag } from "@/components/ui";
import { api, call } from "@/lib/api";
import { useScreenData } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { space } from "@/lib/theme";

/** Relationships the transporter registered (validated by PMD) or was added to by a plant. */
export default function Partners() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useScreenData(() => call(api.GET("/api/v1/relationships")));
  return (
    <Screen title={t("partners.title")} refreshing={loading} onRefresh={reload}>
      <Button label={t("partners.add")} onPress={() => router.push("/partner/new")} />
      <ErrorNotice error={error} />
      {data && data.length === 0 && <Notice>{t("partners.empty")}</Notice>}
      {data?.map((r) => {
        const mine = r.ownerRole === "TRANSPORTER";
        return (
          <ListItem key={r.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm }}>
              <Body bold>{mine ? r.entityName : r.ownerName ?? "—"}</Body>
              <StatusTag status={r.status} />
            </View>
            <Muted>
              {t(`role.${mine ? r.counterpartyRole : r.ownerRole}`)}
              {mine ? `, ${r.documentType} ${r.documentNumber}` : ""}
            </Muted>
            {mine && !r.counterpartyUserId && <Muted>{t("partners.notOnPmd")}</Muted>}
            {r.reviewNotes && <Muted>PMD: {r.reviewNotes}</Muted>}
          </ListItem>
        );
      })}
    </Screen>
  );
}
