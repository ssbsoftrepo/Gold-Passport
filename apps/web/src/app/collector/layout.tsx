import { AppShell } from "@/components/AppShell";

export default function CollectorLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="COLLECTOR">{children}</AppShell>;
}
