import * as SecureStore from "expo-secure-store";
import { NetworkError, setAccessToken } from "./api";
import { isRefreshRejected, refreshCognitoTokens, type CognitoConfig } from "./cognito";

/**
 * Keeps a Cognito sign-in alive. The ID token lasts an hour; the refresh token (kept in the device
 * keystore) renews it without an SMS code for as long as the app client's refresh token validity
 * allows, so a miner can work offline for days and still send their queue in the evening.
 */

/** What renewing a Cognito sign-in needs, saved at sign-in. */
export type CognitoRefresh = CognitoConfig & { refreshToken: string };

export const TOKEN_KEY = "pmd.token";
/** Stored apart from its config: SecureStore values should stay under 2 KB on Android. */
const REFRESH_TOKEN_KEY = "pmd.refresh-token";
const COGNITO_CONFIG_KEY = "pmd.cognito-config";

export async function saveCognitoRefresh(refresh: CognitoRefresh): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refresh.refreshToken);
  await SecureStore.setItemAsync(
    COGNITO_CONFIG_KEY,
    JSON.stringify({ region: refresh.region, clientId: refresh.clientId } satisfies CognitoConfig),
  );
}

export async function readCognitoRefresh(): Promise<CognitoRefresh | null> {
  const [refreshToken, config] = await Promise.all([
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(COGNITO_CONFIG_KEY),
  ]);
  return refreshToken && config ? { ...(JSON.parse(config) as CognitoConfig), refreshToken } : null;
}

export async function forgetCognitoRefresh(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => undefined);
  await SecureStore.deleteItemAsync(COGNITO_CONFIG_KEY).catch(() => undefined);
}

/**
 * The API client's {@link TokenRenewer}: a new ID token from the saved refresh token. Null when there
 * is none or Cognito rejects it (the user must sign in again); a {@link NetworkError} when Cognito
 * cannot be reached or fails for now (try again later, the user stays signed in).
 */
export async function renewCognitoToken(): Promise<string | null> {
  const saved = await readCognitoRefresh();
  if (!saved) return null;
  let renewed: { idToken: string; refreshToken: string | null };
  try {
    renewed = await refreshCognitoTokens(saved, saved.refreshToken);
  } catch (e) {
    if (isRefreshRejected(e)) {
      if ((await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)) === saved.refreshToken) await forgetCognitoRefresh();
      return null;
    }
    throw e instanceof NetworkError ? e : new NetworkError(e instanceof Error ? e.message : String(e));
  }
  // The user signed out (or in as someone else) while this was in flight: do not bring the old sign-in back.
  if ((await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)) !== saved.refreshToken) return null;
  // With rotation the old refresh token stops working shortly, so keep the new one first.
  if (renewed.refreshToken) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, renewed.refreshToken);
  await SecureStore.setItemAsync(TOKEN_KEY, renewed.idToken);
  setAccessToken(renewed.idToken);
  return renewed.idToken;
}
