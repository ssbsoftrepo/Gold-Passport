import { useState } from "react";
import { api, call } from "@/lib/api";
import { cognitoChangePin } from "@/lib/cognito";
import { useAction } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { checkNewPin, PIN_LENGTH } from "@/lib/pin";
import { Button, ErrorNotice, Field, Muted, Notice, Section } from "./ui";

const pinProps = { keyboardType: "number-pad" as const, secureTextEntry: true, maxLength: PIN_LENGTH, autoComplete: "off" as const };

/** Profile → "Cambiar PIN": the person confirms the current PIN and chooses a new one. */
export function ChangePin({ phone }: { phone: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const action = useAction();

  const close = () => {
    setOpen(false);
    setCurrent("");
    setNext("");
    setConfirm("");
    action.setError(null);
  };

  const save = () =>
    action.run(async () => {
      const problem = checkNewPin(next, confirm) ?? (next === current ? { code: "PIN_NOT_ALLOWED" } : null);
      if (problem) throw problem;
      const config = await call(api.GET("/api/v1/auth/config"));
      if (config.mode === "cognito" && config.cognitoRegion && config.cognitoClientId) {
        await cognitoChangePin({ region: config.cognitoRegion, clientId: config.cognitoClientId }, phone, current, next);
      } else {
        await call(api.PUT("/api/v1/me/pin", { body: { currentPin: current, newPin: next } }));
      }
      close();
      setDone(true);
    });

  return (
    <Section title={t("pin.title")}>
      {done && <Notice kind="good">{t("pin.changed")}</Notice>}
      {open ? (
        <>
          <ErrorNotice error={action.error} />
          <Field label={t("pin.current")} value={current} onChangeText={setCurrent} {...pinProps} />
          <Field label={t("login.choosePin")} value={next} onChangeText={setNext} {...pinProps} />
          <Field label={t("login.confirmPin")} value={confirm} onChangeText={setConfirm} {...pinProps} />
          <Muted>{t("login.pinRules")}</Muted>
          <Button label={t("login.savePin")} onPress={save} busy={action.pending} />
          <Button label={t("common.cancel")} variant="quiet" onPress={close} />
        </>
      ) : (
        <Button label={t("pin.change")} variant="quiet" onPress={() => { setDone(false); setOpen(true); }} />
      )}
    </Section>
  );
}
