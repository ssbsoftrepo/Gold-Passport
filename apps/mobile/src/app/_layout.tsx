import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { startFieldLog } from "@/lib/fieldLog";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { initMonitoring, OutboxMonitor } from "@/lib/monitoring";
import { OutboxProvider } from "@/lib/outbox";
import { SessionProvider, useSession } from "@/lib/session";
import { colors } from "@/lib/theme";

initMonitoring();
void SplashScreen.preventAutoHideAsync();

function Navigator() {
  const { status } = useSession();
  const { t } = useI18n();

  useEffect(() => {
    if (status !== "loading") void SplashScreen.hideAsync();
  }, [status]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.slate },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: colors.andesite },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="role" options={{ headerShown: false }} />
      <Stack.Screen name="web-only" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="miner" options={{ headerShown: false }} />
      <Stack.Screen name="transporter" options={{ headerShown: false }} />
      <Stack.Screen name="lot/new" options={{ title: t("lots.new") }} />
      <Stack.Screen name="lot/[lotId]" options={{ title: t("lot.code") }} />
      <Stack.Screen name="transport/new" options={{ title: t("transports.new") }} />
      <Stack.Screen name="transport/[transportId]" options={{ title: t("transports.title") }} />
      <Stack.Screen name="partner/new" options={{ title: t("partners.add") }} />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => startFieldLog(), []);

  return (
    <SafeAreaProvider>
      <I18nProvider>
        <SessionProvider>
          <OutboxProvider>
            <OutboxMonitor />
            <StatusBar style="light" />
            <Navigator />
          </OutboxProvider>
        </SessionProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
