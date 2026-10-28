import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, call, setAccessToken, setTokenRenewer, type Schemas } from "./api";
import { clearCache } from "./cache";
import { revokeCognitoToken } from "./cognito";
import {
  forgetCognitoRefresh,
  readCognitoRefresh,
  renewCognitoToken,
  saveCognitoRefresh,
  TOKEN_KEY,
  type CognitoRefresh,
} from "./refresh";
import { registerForPush } from "./push";

/**
 * Access token in the device keystore (SecureStore) + the current user and onboarding state. With
 * Cognito the refresh token is kept too, and the API client renews the token with it (refresh.ts).
 */

type User = Schemas["UserProfile"];
type Application = Schemas["OnboardingApplication"];

type Session = {
  status: "loading" | "anonymous" | "authenticated";
  user: User | null;
  onboarding: Application | null;
  signIn: (token: string, cognito?: CognitoRefresh) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);
const CACHE_KEY = "pmd.session.cache";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Session["status"]>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [onboarding, setOnboarding] = useState<Application | null>(null);

  const refresh = useCallback(async () => {
    const me = await call(api.GET("/api/v1/me"));
    setUser(me);
    const app = me.role === "MINER" || me.role === "TRANSPORTER" ? await call(api.GET("/api/v1/onboarding/me")) : null;
    setOnboarding(app);
    setStatus("authenticated");
    // Cached so the app opens offline at the mine, where there is often no signal.
    void AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ user: me, onboarding: app }));
  }, []);

  const signOut = useCallback(async () => {
    const saved = await readCognitoRefresh().catch(() => null);
    // Best effort: without signal the refresh token simply expires on its own.
    if (saved) void revokeCognitoToken(saved, saved.refreshToken).catch(() => undefined);
    await forgetCognitoRefresh();
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
    await AsyncStorage.removeItem(CACHE_KEY).catch(() => undefined);
    await clearCache();
    setAccessToken(null);
    setUser(null);
    setOnboarding(null);
    setStatus("anonymous");
  }, []);

  const signIn = useCallback(
    async (token: string, cognito?: CognitoRefresh) => {
      if (cognito) await saveCognitoRefresh(cognito);
      else await forgetCognitoRefresh();
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      setAccessToken(token);
      await refresh();
      void registerForPush();
    },
    [refresh],
  );

  useEffect(() => {
    setTokenRenewer(renewCognitoToken);
    return () => setTokenRenewer(null);
  }, []);

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY)
      .then(async (token) => {
        if (!token) {
          setStatus("anonymous");
          return;
        }
        setAccessToken(token);
        // Open straight away from the cached profile: on a weak signal the refresh below can take
        // a long time, and at the mine there may be none. The refresh updates it when it arrives.
        const cached = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);
        if (cached) {
          const { user: u, onboarding: o } = JSON.parse(cached) as { user: User; onboarding: Application | null };
          setUser(u);
          setOnboarding(o);
          setStatus("authenticated");
        }
        try {
          await refresh();
          void registerForPush();
        } catch (e) {
          // Offline at startup: keep the token and the cached profile. A 401 means the token expired
          // and could not be renewed (the API client already tried the refresh token).
          if (e && typeof e === "object" && "status" in e && (e as { status: number }).status === 401) {
            await signOut();
          } else if (!cached) {
            setStatus("anonymous");
          }
        }
      })
      .catch(() => setStatus("anonymous"));
  }, [refresh, signOut]);

  const value = useMemo<Session>(
    () => ({ status, user, onboarding, signIn, signOut, refresh }),
    [status, user, onboarding, signIn, signOut, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

/** The route a user belongs on, given role and onboarding status. */
export function homeRoute(user: User | null, onboarding: Application | null):
  "/login" | "/role" | "/web-only" | "/onboarding" | "/miner" | "/transporter" {
  if (!user) return "/login";
  if (user.role === null) return "/role";
  if (user.role === "COLLECTOR" || user.role === "ADMIN") return "/web-only";
  if (onboarding?.status !== "APPROVED") return "/onboarding";
  return user.role === "MINER" ? "/miner" : "/transporter";
}
