"use client";

import { I18nProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <SessionProvider>{children}</SessionProvider>
    </I18nProvider>
  );
}
