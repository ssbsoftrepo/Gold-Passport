import { RoleTabs } from "@/components/TabsLayout";

export default function MinerLayout() {
  return (
    <RoleTabs
      role="MINER"
      tabs={[
        { name: "index", titleKey: "tabs.lots" },
        { name: "transports", titleKey: "tabs.transports" },
        { name: "payments", titleKey: "tabs.payments" },
        { name: "inbox", titleKey: "tabs.inbox" },
        { name: "profile", titleKey: "tabs.profile" },
      ]}
    />
  );
}
