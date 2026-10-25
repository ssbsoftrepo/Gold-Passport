import { router } from "expo-router";
import { useState } from "react";
import { Button, ErrorNotice, Field, Screen, Section } from "@/components/ui";
import { api, call } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

export default function NewLot() {
  const { t } = useI18n();
  const [site, setSite] = useState("");
  const [description, setDescription] = useState("");
  const action = useAction();

  const create = () =>
    action.run(async () => {
      const lot = await call(
        api.POST("/api/v1/lots", { body: { mineSiteName: site.trim(), description: description.trim() || null } }),
      );
      router.replace({ pathname: "/lot/[lotId]", params: { lotId: lot.id } });
    });

  return (
    <Screen>
      <ErrorNotice error={action.error} />
      <Section>
        <Field label={t("lots.site")} value={site} onChangeText={setSite} />
        <Field label={t("lots.description")} value={description} onChangeText={setDescription} multiline />
        <Button label={t("lots.create")} onPress={create} disabled={site.trim() === ""} busy={action.pending} />
      </Section>
    </Screen>
  );
}
