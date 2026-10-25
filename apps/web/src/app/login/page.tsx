"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorNotice } from "@/components/ui";
import { api, call, type Schemas } from "@/lib/api";
import { completeCognitoLogin, startCognitoLogin, type CognitoChallenge } from "@/lib/cognito";
import { useAction } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { homeFor, useSession } from "@/lib/session";

export default function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  const { status, user, signIn } = useSession();
  const router = useRouter();
  const [config, setConfig] = useState<Schemas["AuthConfig"] | null>(null);
  const [phone, setPhone] = useState("+51");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cognitoChallenge, setCognitoChallenge] = useState<CognitoChallenge | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const { pending, error, run } = useAction();

  useEffect(() => {
    if (status === "authenticated") router.replace(homeFor(user));
  }, [status, user, router]);

  useEffect(() => {
    call(api.GET("/api/v1/auth/config")).then(setConfig).catch(() => setConfig({ mode: "local" }));
  }, []);

  const cognitoCfg =
    config?.mode === "cognito" && config.cognitoRegion && config.cognitoClientId
      ? { region: config.cognitoRegion, clientId: config.cognitoClientId }
      : null;

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const normalized = phone.replace(/[\s()-]/g, "");
      setPhone(normalized);
      if (cognitoCfg) {
        setCognitoChallenge(await startCognitoLogin(cognitoCfg, normalized));
      } else {
        const challenge = await call(api.POST("/api/v1/auth/otp/request", { body: { phone: normalized } }));
        setDevCode(challenge.devCode);
        if (challenge.devCode) setCode(challenge.devCode);
      }
      setStep("code");
    });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      let token: string;
      if (cognitoCfg && cognitoChallenge) {
        const result = await completeCognitoLogin(cognitoCfg, phone, cognitoChallenge, code.trim());
        if ("needsNewCode" in result) {
          setCognitoChallenge(await startCognitoLogin(cognitoCfg, phone));
          setCode("");
          setInfo(t("login.newCodeSent"));
          return;
        }
        token = result.idToken;
      } else {
        const res = await call(api.POST("/api/v1/auth/otp/verify", { body: { phone, code: code.trim() } }));
        token = res.accessToken;
      }
      const me = await signIn(token);
      router.replace(homeFor(me));
    });
  }

  return (
    <div className="login">
      <section className="login-art">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name">PMD</span>
        </div>
        <div className="stack">
          <p className="big">{t("login.art")}</p>
          <p>{t("login.artSub")}</p>
        </div>
        <button
          type="button"
          className="link-button"
          style={{ color: "var(--slate-text)", alignSelf: "flex-start" }}
          onClick={() => setLocale(locale === "es" ? "en" : "es")}
        >
          {t("common.language")}
        </button>
      </section>

      <section className="login-form">
        <h1>{t("login.title")}</h1>
        <ErrorNotice error={error} />
        {info && <div className="notice notice-good">{info}</div>}

        {step === "phone" ? (
          <form className="stack" onSubmit={requestCode}>
            <label className="field">
              {t("login.phone")}
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </label>
            <p className="muted">{t("login.phoneHelp")}</p>
            <button className="btn" disabled={pending || !config}>
              {t("login.sendCode")}
            </button>
          </form>
        ) : (
          <form className="stack" onSubmit={verify}>
            <p>{phone}</p>
            <label className="field">
              {t("login.code")}
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={8}
                required
                autoFocus
              />
            </label>
            {devCode && <div className="notice notice-wait">{t("login.devHint", { code: devCode })}</div>}
            <button className="btn" disabled={pending}>
              {t("login.verify")}
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setStep("phone");
                setCode("");
                setDevCode(null);
              }}
            >
              {t("login.changePhone")}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
