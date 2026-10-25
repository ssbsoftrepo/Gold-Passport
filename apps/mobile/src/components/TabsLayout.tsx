import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { Text, View } from "react-native";
import { useI18n } from "@/lib/i18n";
import { useOutbox } from "@/lib/outbox";
import { homeRoute, useSession } from "@/lib/session";
import { colors } from "@/lib/theme";

function Glyph({ focused }: { focused: boolean }) {
  return (
    <View
      style={{
        width: 14,
        height: 14,
        borderRadius: 4,
        transform: [{ rotate: "45deg" }],
        backgroundColor: focused ? colors.goldBright : "transparent",
        borderWidth: 2,
        borderColor: focused ? colors.goldBright : colors.inkFaint,
      }}
    />
  );
}

/** Bottom tabs for one role; guards the role and approved onboarding. */
export function RoleTabs({ role, tabs }: { role: "MINER" | "TRANSPORTER"; tabs: { name: string; titleKey: string }[] }) {
  const { t } = useI18n();
  const { status, user, onboarding } = useSession();
  const { items } = useOutbox();

  if (status !== "authenticated" || user?.role !== role || onboarding?.status !== "APPROVED") {
    return <Redirect href={homeRoute(status === "authenticated" ? user : null, onboarding)} />;
  }

  const pending = items.length;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: { backgroundColor: colors.paper, borderTopColor: colors.rule, height: 64, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 13, fontWeight: "600" },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.titleKey),
            tabBarIcon: ({ focused }) => <Glyph focused={focused} />,
            tabBarBadge: tab.name === "profile" && pending > 0 ? pending : undefined,
          }}
        />
      ))}
    </Tabs>
  );
}

export function PendingBanner({ scope }: { scope: string }) {
  const { items } = useOutbox();
  const { t } = useI18n();
  const n = items.filter((i) => i.scope === scope && !i.error).length;
  if (n === 0) return null;
  return (
    <View style={{ backgroundColor: colors.amberWash, padding: 12, borderRadius: 8 }}>
      <Text style={{ color: colors.amberInk, fontWeight: "600" }}>{t("lot.pendingPhotos", { n })}</Text>
    </View>
  );
}
