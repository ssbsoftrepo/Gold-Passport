import { isEnabled, type Feature } from "@/lib/features";
import { useI18n } from "@/lib/i18n";
import { Body, Notice, Screen } from "./ui";

/** Home of an approved user while their role's features are not released yet. */
export function ComingSoon() {
  const { t } = useI18n();
  return (
    <Screen title={t("tabs.home")}>
      <Notice kind="good">{t("soon.title")}</Notice>
      <Body>{t("soon.body")}</Body>
    </Screen>
  );
}

function NotYet() {
  const { t } = useI18n();
  return (
    <Screen>
      <Notice>{t("soon.notYet")}</Notice>
    </Screen>
  );
}

/** Shows a screen only when its feature is part of this release (a link could still lead there). */
export function gated<P extends object>(feature: Feature, Component: React.ComponentType<P>) {
  return function Gated(props: P) {
    return isEnabled(feature) ? <Component {...props} /> : <NotYet />;
  };
}
