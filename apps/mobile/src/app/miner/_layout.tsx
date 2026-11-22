import { RoleTabs } from "@/components/TabsLayout";

export default function MinerLayout() {
  return (
    <RoleTabs
      role="MINER"
      tabs={[
        { name: "index", titleKey: "tabs.lots", feature: "batches" },
        { name: "transports", titleKey: "tabs.transports", feature: "transport" },
        { name: "payments", titleKey: "tabs.payments", feature: "plantFlow" },
        { name: "inbox", titleKey: "tabs.inbox" },
        { name: "profile", titleKey: "tabs.profile" },
      ]}
    />
  );
}
