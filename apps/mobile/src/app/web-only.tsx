import { router } from "expo-router";
import { Body, Button, Screen } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export default function WebOnly() {
  const { t } = useI18n();
  const { signOut } = useSession();
  return (
    <Screen title={t("webOnly.title")}>
      <Body>{t("webOnly.body")}</Body>
      <Button label={t("profile.signOut")} variant="quiet" onPress={() => signOut().then(() => router.replace("/login"))} />
    </Screen>
  );
}
