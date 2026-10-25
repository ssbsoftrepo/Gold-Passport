import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorNotice, Field, Notice } from "@/components/ui";
import { api, call, type Schemas } from "@/lib/api";
import { completeCognitoLogin, startCognitoLogin, type CognitoChallenge } from "@/lib/cognito";
import { useAction } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { colors, space, type } from "@/lib/theme";

export default function Login() {
  const { t, locale, setLocale } = useI18n();
  const { signIn } = useSession();
  const [config, setConfig] = useState<Schemas["AuthConfig"]>({ mode: "local" });
  const [phone, setPhone] = useState("+51");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<CognitoChallenge | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const action = useAction();

  useEffect(() => {
    call(api.GET("/api/v1/auth/config")).then(setConfig).catch(() => undefined);
  }, []);

  const cognito =
    config.mode === "cognito" && config.cognitoRegion && config.cognitoClientId
      ? { region: config.cognitoRegion, clientId: config.cognitoClientId }
      : null;

  const requestCode = () =>
    action.run(async () => {
      const normalized = phone.replace(/[\s()-]/g, "");
      setPhone(normalized);
      if (cognito) {
        setChallenge(await startCognitoLogin(cognito, normalized));
      } else {
        const res = await call(api.POST("/api/v1/auth/otp/request", { body: { phone: normalized } }));
        setDevCode(res.devCode);
        if (res.devCode) setCode(res.devCode);
      }
      setStep("code");
    });

  const verify = () =>
    action.run(async () => {
      let token: string;
      if (cognito && challenge) {
        const result = await completeCognitoLogin(cognito, phone, challenge, code.trim());
        if ("needsNewCode" in result) {
          setChallenge(await startCognitoLogin(cognito, phone));
          setCode("");
          setInfo(t("login.newCodeSent"));
          return;
        }
        token = result.idToken;
      } else {
        token = (await call(api.POST("/api/v1/auth/otp/verify", { body: { phone, code: code.trim() } }))).accessToken;
      }
      await signIn(token);
      router.replace("/");
    });

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={s.top}>
          <View style={s.brandRow}>
            <View style={s.mark} />
            <Text style={s.brand}>PMD</Text>
          </View>
          <Pressable onPress={() => setLocale(locale === "es" ? "en" : "es")} accessibilityRole="button">
            <Text style={s.lang}>{locale === "es" ? "English" : "Español"}</Text>
          </Pressable>
        </View>
        <Text style={s.art}>{t("login.art")}</Text>
        <View style={s.panel}>
          <Text style={s.title}>{t("login.title")}</Text>
          <ErrorNotice error={action.error} />
          {info && <Notice kind="good">{info}</Notice>}
          {step === "phone" ? (
            <>
              <Field label={t("login.phone")} value={phone} onChangeText={setPhone} keyboardType="phone-pad"
                autoComplete="tel" textContentType="telephoneNumber" />
              <Text style={s.help}>{t("login.phoneHelp")}</Text>
              <Button label={t("login.sendCode")} onPress={requestCode} busy={action.pending} />
            </>
          ) : (
            <>
              <Text style={s.help}>{phone}</Text>
              <Field label={t("login.code")} value={code} onChangeText={setCode} keyboardType="number-pad"
                autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={8} autoFocus />
              {devCode && <Notice kind="wait">{t("login.devHint", { code: devCode })}</Notice>}
              <Button label={t("login.verify")} onPress={verify} busy={action.pending} />
              <Button label={t("login.changePhone")} variant="quiet" onPress={() => { setStep("phone"); setCode(""); setDevCode(null); }} />
            </>
          )}
        </View>
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
