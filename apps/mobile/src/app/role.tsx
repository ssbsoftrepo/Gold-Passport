import { router } from "expo-router";
import { Button, ErrorNotice, Muted, Screen, Section } from "@/components/ui";
import { api, call } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export default function ChooseRole() {
  const { t } = useI18n();
  const { refresh, signOut } = useSession();
  const action = useAction();

  const choose = (role: "MINER" | "TRANSPORTER") =>
    action.run(async () => {
      await call(api.PUT("/api/v1/me/role", { body: { role } }));
      await refresh();
      router.replace("/onboarding");
    });

  return (
    <Screen title={t("role.pick.title")}>
      <ErrorNotice error={action.error} />
      <Section title={t("role.pick.miner")}>
        <Muted>{t("role.pick.minerHelp")}</Muted>
        <Button label={t("role.pick.miner")} onPress={() => choose("MINER")} busy={action.pending} />
      </Section>
      <Section title={t("role.pick.transporter")}>
        <Muted>{t("role.pick.transporterHelp")}</Muted>
        <Button label={t("role.pick.transporter")} onPress={() => choose("TRANSPORTER")} busy={action.pending} />
      </Section>
      <Muted>{t("role.pick.collector")}</Muted>
      <Button label={t("profile.signOut")} variant="quiet" onPress={() => signOut().then(() => router.replace("/login"))} />
    </Screen>
  );
}
