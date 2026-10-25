import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, call, setAccessToken, type Schemas } from "./api";
import { registerForPush } from "./push";

/** Access token in the device keystore (SecureStore) + the current user and onboarding state. */

type User = Schemas["UserProfile"];
type Application = Schemas["OnboardingApplication"];

type Session = {
  status: "loading" | "anonymous" | "authenticated";
  user: User | null;
  onboarding: Application | null;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);
const TOKEN_KEY = "pmd.token";
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
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
    await AsyncStorage.removeItem(CACHE_KEY).catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    setOnboarding(null);
    setStatus("anonymous");
  }, []);

  const signIn = useCallback(
    async (token: string) => {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      setAccessToken(token);
      await refresh();
      void registerForPush();
    },
    [refresh],
  );

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY)
      .then(async (token) => {
        if (!token) {
          setStatus("anonymous");
          return;
        }
        setAccessToken(token);
        try {
          await refresh();
          void registerForPush();
        } catch (e) {
          // Offline at startup: keep the token, show the app; 401 means the token expired.
          if (e && typeof e === "object" && "status" in e && (e as { status: number }).status === 401) {
            await signOut();
          } else {
            const cached = await AsyncStorage.getItem(CACHE_KEY);
            if (cached) {
              const { user: u, onboarding: o } = JSON.parse(cached) as { user: User; onboarding: Application | null };
              setUser(u);
              setOnboarding(o);
              setStatus("authenticated");
            } else {
              setStatus("anonymous");
            }
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
