"use client";

import { useEffect, useState } from "react";
import { ErrorNotice, PageHead } from "@/components/ui";
import { api, call, type Schemas } from "@/lib/api";
import { cognitoChangePin } from "@/lib/cognito";
import { useAction } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { checkNewSecret, PIN_LENGTH } from "@/lib/pin";
import { useSession } from "@/lib/session";

/** Change the PIN (PMD staff: the password), after confirming the current one. */
export function ChangeSecret() {
  const { t } = useI18n();
  const { user } = useSession();
  const [config, setConfig] = useState<Schemas["AuthConfig"] | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const action = useAction();
  const staff = user?.role === "ADMIN";

  useEffect(() => {
    call(api.GET("/api/v1/auth/config")).then(setConfig).catch(() => setConfig({ mode: "local" }));
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setDone(false);
    return action.run(async () => {
      const problem = checkNewSecret(next, confirm, staff) ?? (next === current ? { code: "PIN_NOT_ALLOWED" } : null);
      if (problem) throw problem;
      if (config?.mode === "cognito" && config.cognitoRegion && config.cognitoClientId && user) {
        await cognitoChangePin({ region: config.cognitoRegion, clientId: config.cognitoClientId }, user.phone, current, next);
      } else {
        await call(api.PUT("/api/v1/me/pin", { body: { currentPin: current, newPin: next } }));
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    });
  };

  const input = (label: string, value: string, onChange: (v: string) => void, autoComplete: string, isNew: boolean) => (
    <label className="field">
      {label}
      <input
        type="password"
        autoComplete={autoComplete}
        {...(!staff && isNew ? { inputMode: "numeric" as const, pattern: "\\d*", maxLength: PIN_LENGTH } : {})}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      />
    </label>
  );

  return (
    <>
      <PageHead title={t("account.title")} subtitle={t(staff ? "account.subtitleStaff" : "account.subtitle")} />
      <form className="panel stack" style={{ maxWidth: 420 }} onSubmit={submit}>
        <h2>{t(staff ? "account.changePassword" : "account.changePin")}</h2>
        <ErrorNotice error={action.error} />
        {done && <div className="notice notice-good" role="status">{t(staff ? "account.passwordChanged" : "account.pinChanged")}</div>}
        {input(t(staff ? "account.currentPassword" : "account.currentPin"), current, setCurrent, "current-password", false)}
        {input(t(staff ? "login.choosePassword" : "login.choosePin"), next, setNext, "new-password", true)}
        {input(t(staff ? "login.confirmPassword" : "login.confirmPin"), confirm, setConfirm, "new-password", true)}
        <p className="muted">{t(staff ? "login.passwordRules" : "login.pinRules")}</p>
        <button className="btn" disabled={action.pending || !config}>{t("common.save")}</button>
      </form>
    </>
  );
}
