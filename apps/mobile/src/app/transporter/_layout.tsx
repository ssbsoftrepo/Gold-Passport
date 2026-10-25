import { RoleTabs } from "@/components/TabsLayout";

export default function TransporterLayout() {
  return (
    <RoleTabs
      role="TRANSPORTER"
      tabs={[
        { name: "index", titleKey: "tabs.transports" },
        { name: "partners", titleKey: "tabs.partners" },
        { name: "inbox", titleKey: "tabs.inbox" },
        { name: "profile", titleKey: "tabs.profile" },
      ]}
    />
  );
}
