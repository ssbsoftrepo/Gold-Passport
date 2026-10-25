import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { homeRoute, useSession } from "@/lib/session";
import { colors } from "@/lib/theme";

/** Entry: routes each user by session, role and onboarding status. */
export default function Index() {
  const { status, user, onboarding } = useSession();
  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.slate }}>
        <ActivityIndicator color={colors.goldBright} />
      </View>
    );
  }
  return <Redirect href={homeRoute(status === "authenticated" ? user : null, onboarding)} />;
}
