"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, call, setAccessToken, type Schemas } from "./api";

/**
 * Holds the access token and the current user.
 *
 * The token is kept in sessionStorage so a closed tab signs the user out. For production,
 * consider moving to an httpOnly cookie issued by a small backend-for-frontend (see
 * docs/security.md).
 */

type User = Schemas["UserProfile"];

type Session = {
  status: "loading" | "anonymous" | "authenticated";
  user: User | null;
  signIn: (token: string) => Promise<User>;
  signOut: () => void;
  refreshUser: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);
const TOKEN_KEY = "pmd.token";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Session["status"]>("loading");
  const [user, setUser] = useState<User | null>(null);

  const signOut = useCallback(() => {
    try {
      window.sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
    setAccessToken(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  const loadUser = useCallback(async () => {
    const me = await call(api.GET("/api/v1/me"));
    setUser(me);
    setStatus("authenticated");
    return me;
  }, []);

  const signIn = useCallback(
    async (token: string) => {
      try {
        window.sessionStorage.setItem(TOKEN_KEY, token);
      } catch {
        // ignore
      }
      setAccessToken(token);
      return loadUser();
    },
    [loadUser],
  );

  useEffect(() => {
    let token: string | null = null;
    try {
      token = window.sessionStorage.getItem(TOKEN_KEY);
    } catch {
      token = null;
    }
    if (!token) {
      // The token lives in browser storage, which is only readable after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("anonymous");
      return;
    }
    setAccessToken(token);
    loadUser().catch(signOut);
  }, [loadUser, signOut]);

  const value = useMemo<Session>(
    () => ({ status, user, signIn, signOut, refreshUser: async () => void (await loadUser()) }),
    [status, user, signIn, signOut, loadUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

/** Where a signed-in user belongs. */
export function homeFor(user: User | null): string {
  if (!user) return "/login";
  if (user.role === "ADMIN") return "/admin";
  if (user.role === "COLLECTOR") return "/collector";
  if (user.role === null) return "/onboarding";
  return "/field-app";
}
