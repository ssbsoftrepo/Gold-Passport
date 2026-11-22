"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorNotice } from "@/components/ui";
import { api, call, type Schemas } from "@/lib/api";
import {
  cognitoChangeSecret,
  cognitoNewPin,
  cognitoSignIn,
  cognitoSignUp,
  type CognitoConfig,
  type CognitoTokens,
} from "@/lib/cognito";
import { useAction } from "@/lib/hooks";
import { isEnabled } from "@/lib/features";
import { useI18n } from "@/lib/i18n";
import { checkNewSecret, PIN_LENGTH, STAFF_PASSWORD_MIN_LENGTH } from "@/lib/pin";
import { homeFor, useSession } from "@/lib/session";

type Mode = "signIn" | "signUp" | "newPin" | "staffPassword";

/** A secret reset by PMD: the temporary value (local mode) or Cognito's challenge session. */
type Reset = { temporary: string; session: string | null };

/** Signed in, but a PMD staff account still has a short PIN: it must choose a longer password first. */
type Pending = { token: string; secret: string; cognitoAccessToken: string | null };

/**
 * Sign-in with phone number + 6-digit PIN (PMD staff: a password of 10+ characters). No SMS: a
 * forgotten PIN is reset by PMD. Plants create their account here; miners and transporters use the app.
 */
export default function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  const { status, user, signIn } = useSession();
  const router = useRouter();
  const [config, setConfig] = useState<Schemas["AuthConfig"] | null>(null);
  const [mode, setMode] = useState<Mode>("signIn");
  const [phone, setPhone] = useState("+51");
  const [secret, setSecret] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reset, setReset] = useState<Reset | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const action = useAction();

  useEffect(() => {
    if (status === "authenticated") router.replace(homeFor(user));
  }, [status, user, router]);

  useEffect(() => {
    call(api.GET("/api/v1/auth/config")).then(setConfig).catch(() => setConfig({ mode: "local" }));
  }, []);

  const cognitoCfg: CognitoConfig | null =
    config?.mode === "cognito" && config.cognitoRegion && config.cognitoClientId
      ? { region: config.cognitoRegion, clientId: config.cognitoClientId }
      : null;

  const switchTo = (next: Mode) => {
    setMode(next);
    setSecret("");
    setConfirm("");
    action.clearError();
  };

  const normalizedPhone = () => {
    const normalized = phone.replace(/[\s()-]/g, "");
    setPhone(normalized);
    return normalized;
  };

  /** Staff with a short PIN choose a longer password before they get in; everyone else goes home. */
  async function finish(token: string, usedSecret: string, cognitoTokens?: CognitoTokens) {
    const me = await call(api.GET("/api/v1/me", { headers: { Authorization: `Bearer ${token}` } }));
    if (me.role === "ADMIN" && usedSecret.length < STAFF_PASSWORD_MIN_LENGTH) {
      setPending({ token, secret: usedSecret, cognitoAccessToken: cognitoTokens?.accessToken ?? null });
      switchTo("staffPassword");
      return;
    }
    const signedIn = await signIn(token);
    router.replace(homeFor(signedIn));
  }

  const submitSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    return action.run(async () => {
      const number = normalizedPhone();
      if (cognitoCfg) {
        const result = await cognitoSignIn(cognitoCfg, number, secret);
        if ("newPinRequired" in result) {
          setReset({ temporary: secret, session: result.session });
          switchTo("newPin");
          return;
        }
        await finish(result.idToken, secret, result);
        return;
      }
      try {
        const res = await call(api.POST("/api/v1/auth/pin/sign-in", { body: { phone: number, pin: secret } }));
        await finish(res.accessToken, secret);
      } catch (err) {
        if ((err as { code?: string }).code !== "PIN_CHANGE_REQUIRED") throw err;
        setReset({ temporary: secret, session: null });
        switchTo("newPin");
      }
    });
  };

  const submitSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    return action.run(async () => {
      const problem = checkNewSecret(secret, confirm, false);
      if (problem) throw problem;
      const number = normalizedPhone();
      if (cognitoCfg) {
        const result = await cognitoSignUp(cognitoCfg, number, secret);
        await finish(result.idToken, secret, result);
        return;
      }
      const res = await call(api.POST("/api/v1/auth/pin/sign-up", { body: { phone: number, pin: secret } }));
      await finish(res.accessToken, secret);
    });
  };

  // A reset staff account gets a long temporary password, so it chooses a password again.
  const resetIsStaff = (reset?.temporary.length ?? 0) >= STAFF_PASSWORD_MIN_LENGTH;

  const submitNewPin = (e: React.FormEvent) => {
    e.preventDefault();
    return action.run(async () => {
      if (!reset) return;
      const problem = checkNewSecret(secret, confirm, resetIsStaff)
        ?? (secret === reset.temporary ? { code: "PIN_NOT_ALLOWED" } : null);
      if (problem) throw problem;
      if (cognitoCfg && reset.session) {
        const result = await cognitoNewPin(cognitoCfg, phone, reset.session, secret);
        await finish(result.idToken, secret, result);
        return;
      }
      const res = await call(api.POST("/api/v1/auth/pin/new", {
        body: { phone, temporaryPin: reset.temporary, newPin: secret },
      }));
      await finish(res.accessToken, secret);
    });
  };

  const submitStaffPassword = (e: React.FormEvent) => {
    e.preventDefault();
    return action.run(async () => {
      if (!pending) return;
      const problem = checkNewSecret(secret, confirm, true);
      if (problem) throw problem;
      if (cognitoCfg && pending.cognitoAccessToken) {
        await cognitoChangeSecret(cognitoCfg, pending.cognitoAccessToken, pending.secret, secret);
      } else {
        await call(api.PUT("/api/v1/me/pin", {
          body: { currentPin: pending.secret, newPin: secret },
          headers: { Authorization: `Bearer ${pending.token}` },
        }));
      }
      const signedIn = await signIn(pending.token);
      router.replace(homeFor(signedIn));
    });
  };

  const pinInput = (value: string, onChange: (v: string) => void, autoComplete: string) => (
    <input type="password" inputMode="numeric" pattern="\d*" maxLength={PIN_LENGTH} autoComplete={autoComplete}
      value={value} onChange={(e) => onChange(e.target.value)} required />
  );
  const passwordInput = (value: string, onChange: (v: string) => void, autoComplete: string) => (
    <input type="password" autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} required />
  );
  const newSecretInput = (staff: boolean, value: string, onChange: (v: string) => void) =>
    staff ? passwordInput(value, onChange, "new-password") : pinInput(value, onChange, "new-password");

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
        {isEnabled("english") && (
          <button
            type="button"
            className="link-button"
            style={{ color: "var(--slate-text)", alignSelf: "flex-start" }}
            onClick={() => setLocale(locale === "es" ? "en" : "es")}
          >
            {t("common.language")}
          </button>
        )}
      </section>

      <section className="login-form">
        {mode === "signIn" && (
          <form className="stack" onSubmit={submitSignIn}>
            <h1>{t("login.title")}</h1>
            <ErrorNotice error={action.error} />
            <label className="field">
              {t("login.phone")}
              <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </label>
            <label className="field">
              {t("login.pin")}
              {passwordInput(secret, setSecret, "current-password")}
            </label>
            <button className="btn" disabled={action.pending || !config}>{t("login.signIn")}</button>
            <p className="muted">{t("login.forgotPin")}</p>
            <button type="button" className="link-button" onClick={() => switchTo("signUp")}>
              {t("login.createAccount")}
            </button>
          </form>
        )}

        {mode === "signUp" && (
          <form className="stack" onSubmit={submitSignUp}>
            <h1>{t("login.signUpTitle")}</h1>
            <p className="muted">{t("login.signUpHelp")}</p>
            <ErrorNotice error={action.error} />
            <label className="field">
              {t("login.phone")}
              <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </label>
            <label className="field">
              {t("login.choosePin")}
              {pinInput(secret, setSecret, "new-password")}
            </label>
            <label className="field">
              {t("login.confirmPin")}
              {pinInput(confirm, setConfirm, "new-password")}
            </label>
            <p className="muted">{t("login.pinRules")}</p>
            <button className="btn" disabled={action.pending || !config}>{t("login.createAccount")}</button>
            <button type="button" className="link-button" onClick={() => switchTo("signIn")}>
              {t("login.haveAccount")}
            </button>
          </form>
        )}

        {mode === "newPin" && (
          <form className="stack" onSubmit={submitNewPin}>
            <h1>{t(resetIsStaff ? "login.newPasswordTitle" : "login.newPinTitle")}</h1>
            <div className="notice notice-wait">{t(resetIsStaff ? "login.newPasswordBody" : "login.newPinBody")}</div>
            <ErrorNotice error={action.error} />
            <label className="field">
              {t(resetIsStaff ? "login.choosePassword" : "login.choosePin")}
              {newSecretInput(resetIsStaff, secret, setSecret)}
            </label>
            <label className="field">
              {t(resetIsStaff ? "login.confirmPassword" : "login.confirmPin")}
              {newSecretInput(resetIsStaff, confirm, setConfirm)}
            </label>
            <p className="muted">{t(resetIsStaff ? "login.passwordRules" : "login.pinRules")}</p>
            <button className="btn" disabled={action.pending}>{t(resetIsStaff ? "login.savePassword" : "login.savePin")}</button>
            <button type="button" className="link-button" onClick={() => { setReset(null); switchTo("signIn"); }}>
              {t("common.cancel")}
            </button>
          </form>
        )}

        {mode === "staffPassword" && (
          <form className="stack" onSubmit={submitStaffPassword}>
            <h1>{t("login.staffPasswordTitle")}</h1>
            <div className="notice notice-wait">{t("login.staffPasswordBody")}</div>
            <ErrorNotice error={action.error} />
            <label className="field">
              {t("login.choosePassword")}
              {passwordInput(secret, setSecret, "new-password")}
            </label>
            <label className="field">
              {t("login.confirmPassword")}
              {passwordInput(confirm, setConfirm, "new-password")}
            </label>
            <p className="muted">{t("login.passwordRules")}</p>
            <button className="btn" disabled={action.pending}>{t("login.savePassword")}</button>
          </form>
        )}
      </section>
    </div>
  );
}
