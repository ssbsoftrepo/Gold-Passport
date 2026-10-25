import { router } from "expo-router";
import { useState } from "react";
import { Button, Choice, ErrorNotice, Field, Screen, Section } from "@/components/ui";
import { api, call } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

/** Transporter registers a Miner or Collector/Plant; PMD validates the relationship. */
export default function NewPartner() {
  const { t } = useI18n();
  const action = useAction();
  const [form, setForm] = useState({
    counterpartyRole: "MINER" as "MINER" | "COLLECTOR",
    entityName: "",
    documentType: "DNI" as "DNI" | "RUC" | "CE",
    documentNumber: "",
    phone: "",
    contactPerson: "",
  });

  const submit = () =>
    action.run(async () => {
      await call(
        api.POST("/api/v1/relationships", {
          body: {
            counterpartyRole: form.counterpartyRole,
            entityName: form.entityName.trim(),
            documentType: form.documentType,
            documentNumber: form.documentNumber.trim(),
            phone: form.phone.trim() || null,
            contactPerson: form.contactPerson.trim() || null,
          },
        }),
      );
      router.back();
    });

  return (
    <Screen>
      <ErrorNotice error={action.error} />
      <Section>
        <Choice label={t("partners.type")} value={form.counterpartyRole}
          options={[{ value: "MINER", label: t("role.MINER") }, { value: "COLLECTOR", label: t("role.COLLECTOR") }]}
          onChange={(v) => setForm({ ...form, counterpartyRole: v, documentType: v === "COLLECTOR" ? "RUC" : "DNI" })} />
        <Field label={t("partners.name")} value={form.entityName} onChangeText={(v) => setForm({ ...form, entityName: v })} />
        <Choice label={t("partners.docType")} value={form.documentType}
          options={[{ value: "DNI", label: "DNI" }, { value: "RUC", label: "RUC" }, { value: "CE", label: "CE" }]}
          onChange={(v) => setForm({ ...form, documentType: v })} />
        <Field label={t("partners.docNumber")} value={form.documentNumber} keyboardType="number-pad"
          onChangeText={(v) => setForm({ ...form, documentNumber: v })} />
        <Field label={t("partners.phone")} value={form.phone} keyboardType="phone-pad"
          onChangeText={(v) => setForm({ ...form, phone: v })} />
        <Field label={t("partners.contact")} value={form.contactPerson}
          onChangeText={(v) => setForm({ ...form, contactPerson: v })} />
        <Button label={t("partners.submit")} onPress={submit} busy={action.pending}
          disabled={!form.entityName.trim() || !form.documentNumber.trim()} />
      </Section>
    </Screen>
  );
}
