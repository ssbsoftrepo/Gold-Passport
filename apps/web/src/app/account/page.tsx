"use client";

import { AppShell } from "@/components/AppShell";
import { ChangeSecret } from "@/components/ChangeSecret";
import { useSession } from "@/lib/session";

export default function AccountPage() {
  const { user } = useSession();
  const role = user?.role === "COLLECTOR" ? "COLLECTOR" : "ADMIN";
  return (
    <AppShell role={role}>
      <ChangeSecret />
    </AppShell>
  );
}
