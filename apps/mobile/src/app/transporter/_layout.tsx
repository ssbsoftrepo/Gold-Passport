import { RoleTabs } from "@/components/TabsLayout";

export default function TransporterLayout() {
  return (
    <RoleTabs
      role="TRANSPORTER"
      tabs={[
        { name: "index", titleKey: "tabs.transports", feature: "transport" },
        { name: "partners", titleKey: "tabs.partners", feature: "transport" },
        { name: "inbox", titleKey: "tabs.inbox" },
        { name: "profile", titleKey: "tabs.profile" },
      ]}
    />
  );
}
