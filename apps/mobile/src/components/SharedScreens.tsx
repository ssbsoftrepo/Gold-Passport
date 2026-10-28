import { router } from "expo-router";
import { View } from "react-native";
import { api, call } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAction, useScreenData } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useOutbox } from "@/lib/outbox";
import { useSession } from "@/lib/session";
import { space } from "@/lib/theme";
import { Body, Button, Choice, ErrorNotice, ListItem, Muted, Notice, Row, Screen, Section } from "./ui";

export function InboxScreen() {
  const { t, locale } = useI18n();
  const { data, error, loading, reload, staleSince } = useScreenData(() => call(api.GET("/api/v1/notifications", {})), "notifications");
  const action = useAction();
  return (
    <Screen title={t("inbox.title")} refreshing={loading} onRefresh={reload}>
      <ErrorNotice error={error ?? action.error} staleSince={error ? staleSince : null} />
      {data && data.length === 0 && <Notice>{t("inbox.empty")}</Notice>}
      {data && data.some((n) => !n.read) && (
        <Button label={t("inbox.markAll")} variant="quiet"
          onPress={() => action.run(async () => { await call(api.POST("/api/v1/notifications/read-all")); await reload(); })} />
      )}
      {data?.map((n) => (
        <ListItem key={n.id}>
          <Body bold={!n.read}>{n.title}</Body>
          <Body>{n.body}</Body>
          <Muted>{formatDateTime(n.createdAt, locale)}</Muted>
        </ListItem>
      ))}
    </Screen>
  );
}

export function ProfileScreen() {
  const { t, locale, setLocale } = useI18n();
  const { user, signOut } = useSession();
  const { items, syncing, needsSignIn, syncNow, discard } = useOutbox();
  const waiting = items.some((i) => !i.error);

  const changeLocale = (l: "es" | "en") => {
    setLocale(l);
    void api.PATCH("/api/v1/me", { body: { locale: l } });
  };

  return (
    <Screen title={t("profile.title")}>
      <Section>
        <Row label={t("onb.fullName")} value={user?.displayName ?? "—"} />
        <Row label={t("login.phone")} value={user?.phone ?? "—"} />
        <Row label={t("profile.role")} value={user?.role ? t(`role.${user.role}`) : "—"} />
      </Section>
      <Section>
        <Choice label={t("profile.language")} value={locale}
          options={[{ value: "es", label: "Español" }, { value: "en", label: "English" }]} onChange={changeLocale} />
      </Section>
      <Section title={t("profile.outbox")}>
        {needsSignIn && <Notice kind="bad">{t("profile.signInToSend")}</Notice>}
        {waiting && !needsSignIn && !syncing && <Muted>{t("profile.waitingForSignal")}</Muted>}
        {items.length === 0 ? (
          <Muted>{t("profile.outboxEmpty")}</Muted>
        ) : (
          items.map((i) => (
            <View key={i.id} style={{ gap: space.xs }}>
              <Body>{i.label}</Body>
              <Muted>{formatDateTime(i.createdAt, locale)}</Muted>
              {i.error && (
                <>
                  <Notice kind="bad">{t("profile.failed", { error: i.error })}</Notice>
                  <Button label={t("profile.discard")} variant="danger" onPress={() => discard(i.id)} />
                </>
              )}
            </View>
          ))
        )}
        {items.length > 0 && <Button label={t("profile.syncNow")} onPress={syncNow} busy={syncing} />}
      </Section>
      <Button label={t("profile.signOut")} variant="quiet" onPress={() => signOut().then(() => router.replace("/login"))} />
    </Screen>
  );
}
