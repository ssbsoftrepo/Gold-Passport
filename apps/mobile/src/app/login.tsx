import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorNotice, Field, Notice } from "@/components/ui";
import { api, call, type Schemas } from "@/lib/api";
import { cognitoNewPin, cognitoSignIn, cognitoSignUp, type CognitoConfig, type CognitoTokens } from "@/lib/cognito";
import { useAction } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { isEnabled } from "@/lib/features";
import { checkNewPin, PIN_LENGTH } from "@/lib/pin";
import type { CognitoRefresh } from "@/lib/refresh";
import { useSession } from "@/lib/session";
import { colors, space, type } from "@/lib/theme";

type Mode = "signIn" | "signUp" | "newPin";

/** A PIN reset by PMD: the temporary PIN (local mode) or Cognito's challenge session. */
type Reset = { temporaryPin: string; session: string | null };

const pinProps = {
  keyboardType: "number-pad" as const,
  secureTextEntry: true,
  maxLength: PIN_LENGTH,
  autoComplete: "off" as const,
};

/** Sign-in with phone number + 6-digit PIN. No SMS: a forgotten PIN is reset by PMD. */
export default function Login() {
  const { t, locale, setLocale } = useI18n();
  const { signIn } = useSession();
  const [config, setConfig] = useState<Schemas["AuthConfig"]>({ mode: "local" });
  const [mode, setMode] = useState<Mode>("signIn");
  const [phone, setPhone] = useState("+51");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [reset, setReset] = useState<Reset | null>(null);
  const action = useAction();

  useEffect(() => {
    call(api.GET("/api/v1/auth/config")).then(setConfig).catch(() => undefined);
  }, []);

  const cognito: CognitoConfig | null =
    config.mode === "cognito" && config.cognitoRegion && config.cognitoClientId
      ? { region: config.cognitoRegion, clientId: config.cognitoClientId }
      : null;

  const switchTo = (next: Mode) => {
    setMode(next);
    setPin("");
    setConfirmPin("");
    action.setError(null);
  };

  const normalizedPhone = () => {
    const normalized = phone.replace(/[\s()-]/g, "");
    setPhone(normalized);
    return normalized;
  };

  const finish = async (token: string, cognitoTokens?: CognitoTokens) => {
    const refresh: CognitoRefresh | undefined =
      cognito && cognitoTokens?.refreshToken ? { ...cognito, refreshToken: cognitoTokens.refreshToken } : undefined;
    await signIn(token, refresh);
    router.replace("/");
  };

  const submitSignIn = () =>
    action.run(async () => {
      const number = normalizedPhone();
      if (cognito) {
        const result = await cognitoSignIn(cognito, number, pin);
        if ("newPinRequired" in result) {
          setReset({ temporaryPin: pin, session: result.session });
          switchTo("newPin");
          return;
        }
        await finish(result.idToken, result);
        return;
      }
      try {
        const res = await call(api.POST("/api/v1/auth/pin/sign-in", { body: { phone: number, pin } }));
        await finish(res.accessToken);
      } catch (e) {
        if ((e as { code?: string }).code !== "PIN_CHANGE_REQUIRED") throw e;
        setReset({ temporaryPin: pin, session: null });
        switchTo("newPin");
      }
    });

  const submitSignUp = () =>
    action.run(async () => {
      const problem = checkNewPin(pin, confirmPin);
      if (problem) throw problem;
      const number = normalizedPhone();
      if (cognito) {
        const result = await cognitoSignUp(cognito, number, pin);
        await finish(result.idToken, result);
        return;
      }
      const res = await call(api.POST("/api/v1/auth/pin/sign-up", { body: { phone: number, pin } }));
      await finish(res.accessToken);
    });

  const submitNewPin = () =>
    action.run(async () => {
      if (!reset) return;
      const problem = checkNewPin(pin, confirmPin) ?? (pin === reset.temporaryPin ? { code: "PIN_NOT_ALLOWED" } : null);
      if (problem) throw problem;
      if (cognito && reset.session) {
        const result = await cognitoNewPin(cognito, phone, reset.session, pin);
        await finish(result.idToken, result);
        return;
      }
      const res = await call(api.POST("/api/v1/auth/pin/new", {
        body: { phone, temporaryPin: reset.temporaryPin, newPin: pin },
      }));
      await finish(res.accessToken);
    });

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={s.top}>
            <View style={s.brandRow}>
              <View style={s.mark} />
              <Text style={s.brand}>PMD</Text>
            </View>
            {isEnabled("english") && (
              <Pressable onPress={() => setLocale(locale === "es" ? "en" : "es")} accessibilityRole="button">
                <Text style={s.lang}>{locale === "es" ? "English" : "Español"}</Text>
              </Pressable>
            )}
          </View>
          <Text style={s.art}>{t("login.art")}</Text>
          <View style={s.panel}>
            {mode === "signIn" && (
              <>
                <Text style={s.title}>{t("login.title")}</Text>
                <ErrorNotice error={action.error} />
                <Field label={t("login.phone")} value={phone} onChangeText={setPhone} keyboardType="phone-pad"
                  autoComplete="tel" textContentType="telephoneNumber" />
                <Field label={t("login.pin")} value={pin} onChangeText={setPin} {...pinProps} />
                <Button label={t("login.signIn")} onPress={submitSignIn} busy={action.pending} />
                <Text style={s.help}>{t("login.forgotPin")}</Text>
                <Button label={t("login.createAccount")} variant="quiet" onPress={() => switchTo("signUp")} />
              </>
            )}
            {mode === "signUp" && (
              <>
                <Text style={s.title}>{t("login.signUpTitle")}</Text>
                <ErrorNotice error={action.error} />
                <Field label={t("login.phone")} value={phone} onChangeText={setPhone} keyboardType="phone-pad"
                  autoComplete="tel" textContentType="telephoneNumber" />
                <Field label={t("login.choosePin")} value={pin} onChangeText={setPin} {...pinProps} />
                <Field label={t("login.confirmPin")} value={confirmPin} onChangeText={setConfirmPin} {...pinProps} />
                <Text style={s.help}>{t("login.pinRules")}</Text>
                <Button label={t("login.createAccount")} onPress={submitSignUp} busy={action.pending} />
                <Button label={t("login.haveAccount")} variant="quiet" onPress={() => switchTo("signIn")} />
              </>
            )}
            {mode === "newPin" && (
              <>
                <Text style={s.title}>{t("login.newPinTitle")}</Text>
                <Notice kind="wait">{t("login.newPinBody")}</Notice>
                <ErrorNotice error={action.error} />
                <Field label={t("login.choosePin")} value={pin} onChangeText={setPin} {...pinProps} />
                <Field label={t("login.confirmPin")} value={confirmPin} onChangeText={setConfirmPin} {...pinProps} />
                <Text style={s.help}>{t("login.pinRules")}</Text>
                <Button label={t("login.savePin")} onPress={submitNewPin} busy={action.pending} />
                <Button label={t("common.cancel")} variant="quiet" onPress={() => { setReset(null); switchTo("signIn"); }} />
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: space.xl },
  brandRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  mark: { width: 28, height: 28, backgroundColor: colors.goldBright, borderRadius: 8, transform: [{ rotate: "45deg" }] },
  brand: { color: colors.white, fontSize: type.title, fontWeight: "900", letterSpacing: 2 },
  lang: { color: colors.slateText, textDecorationLine: "underline", fontSize: type.body },
  art: { color: colors.white, fontSize: 40, lineHeight: 44, fontWeight: "900", paddingHorizontal: space.xl, marginTop: space.xxl },
  panel: {
    marginTop: "auto",
    backgroundColor: colors.paper,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: space.xl,
    gap: space.lg,
    paddingBottom: space.xxl * 1.5,
  },
  title: { fontSize: type.title, fontWeight: "800", color: colors.ink },
  help: { fontSize: type.body, color: colors.inkSoft },
});
