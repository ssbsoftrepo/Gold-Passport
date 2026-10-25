import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";

/**
 * Registers the native push token (FCM on Android, APNs on iOS) with the backend, which
 * delivers through Amazon SNS in AWS. Best-effort: in Expo Go or without permission it is skipped.
 */
export async function registerForPush(): Promise<void> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const token = await Notifications.getDevicePushTokenAsync();
    if (typeof token.data !== "string") return;
    await api.POST("/api/v1/devices", {
      body: { token: token.data, platform: Platform.OS === "ios" ? "IOS" : "ANDROID" },
    });
  } catch {
    // Push is optional: the in-app inbox always has every notification.
  }
}
