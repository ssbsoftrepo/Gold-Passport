import { useNetInfo } from "@react-native-community/netinfo";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { isNetworkError } from "@/lib/api";
import { formatDateTime, tone } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { colors, radius, space, type } from "@/lib/theme";

export function Screen({
  children,
  refreshing,
  onRefresh,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  title?: string;
  subtitle?: string;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <OfflineBar />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
      >
        {title && <Text style={styles.title}>{title}</Text>}
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Thin bar while the phone has no internet, so field users know their work is kept, not lost. */
function OfflineBar() {
  const { t } = useI18n();
  const net = useNetInfo();
  if (net.isConnected !== false && net.isInternetReachable !== false) return null;
  return (
    <View accessibilityRole="alert" style={styles.offlineBar}>
      <Text style={styles.offlineText}>{t("common.offlineBar")}</Text>
    </View>
  );
}

export function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {title && <Text style={styles.sectionTitle}>{title}</Text>}
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "good" | "quiet" | "danger";
  disabled?: boolean;
  busy?: boolean;
}) {
  const bg = { primary: colors.gold, good: colors.jade, quiet: "transparent", danger: "transparent" }[variant];
  const fg = { primary: colors.white, good: colors.white, quiet: colors.ink, danger: colors.cinnabar }[variant];
  const border = variant === "quiet" ? "#bfc8c3" : variant === "danger" ? "#dcb2a8" : bg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.inkFaint} style={styles.input} {...props} />
    </View>
  );
}

export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choiceRow}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(o.value)}
              style={[styles.choice, selected && styles.choiceSelected]}
            >
              <Text style={[styles.choiceText, selected && { color: colors.white }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function StatusTag({ status, label }: { status: string; label?: string }) {
  const { t } = useI18n();
  const tn = tone(status);
  const bg = { good: colors.jadeWash, bad: colors.cinnabarWash, wait: colors.amberWash, neutral: "#e3e7e4" }[tn];
  const fg = { good: colors.jade, bad: colors.cinnabar, wait: colors.amberInk, neutral: colors.ink }[tn];
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[styles.tagText, { color: fg }]}>{label ?? t(`status.${status}`)}</Text>
    </View>
  );
}

export function Notice({ children, kind = "info" }: { children: React.ReactNode; kind?: "info" | "bad" | "good" | "wait" }) {
  const bg = { info: colors.paper, bad: colors.cinnabarWash, good: colors.jadeWash, wait: colors.amberWash }[kind];
  return (
    <View style={[styles.notice, { backgroundColor: bg }]}>
      {typeof children === "string" ? <Text style={styles.body}>{children}</Text> : children}
    </View>
  );
}

/**
 * Shows an error. With `staleSince` (from useScreenData) a connection problem is shown as a calm
 * "showing saved data" notice instead, since the screen still has data to work with.
 */
export function ErrorNotice({ error, staleSince }: { error: unknown; staleSince?: string | null }) {
  const { t, tError, locale } = useI18n();
  if (!error) return null;
  if (staleSince && isNetworkError(error)) {
    return <Notice kind="wait">{t("common.showingSaved", { time: formatDateTime(staleSince, locale) })}</Notice>;
  }
  return <Notice kind="bad">{tError(error)}</Notice>;
}

export function Stamp({ children, size = type.large }: { children: string; size?: number }) {
  return <Text style={[styles.stamp, { fontSize: size }]}>{children}</Text>;
}

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {typeof value === "string" || typeof value === "number" ? <Text style={styles.rowValue}>{value}</Text> : value}
    </View>
  );
}

export function ListItem({ onPress, children }: { onPress?: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.item, pressed && onPress ? { backgroundColor: "#f1f4f1" } : null]}
    >
      {children}
    </Pressable>
  );
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Body({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return <Text style={[styles.body, bold && { fontWeight: "700" }]}>{children}</Text>;
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.andesite },
  scroll: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  title: { fontSize: type.title, fontWeight: "700", color: colors.ink },
  subtitle: { fontSize: type.body, color: colors.inkSoft, marginTop: -space.sm },
  section: {
    backgroundColor: colors.paper,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.rule,
    padding: space.lg,
    gap: space.md,
  },
  sectionTitle: { fontSize: type.large, fontWeight: "700", color: colors.ink },
  button: {
    minHeight: 50,
    borderRadius: radius.control,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  buttonText: { fontSize: type.large, fontWeight: "700" },
  label: { fontSize: type.small, color: colors.inkSoft },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#bfc8c3",
    borderRadius: radius.control,
    backgroundColor: colors.white,
    paddingHorizontal: space.md,
    fontSize: type.large,
    color: colors.ink,
  },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  choice: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: "#bfc8c3",
    backgroundColor: colors.white,
  },
  choiceSelected: { backgroundColor: colors.slate, borderColor: colors.slate },
  choiceText: { fontSize: type.body, fontWeight: "600", color: colors.ink },
  tag: { alignSelf: "flex-start", borderRadius: radius.tag, paddingHorizontal: space.sm, paddingVertical: 3 },
  tagText: { fontSize: type.small, fontWeight: "700" },
  offlineBar: { backgroundColor: colors.amberWash, paddingHorizontal: space.md, paddingVertical: space.xs },
  offlineText: { color: colors.amberInk, fontWeight: "600", textAlign: "center" },
  notice: { borderRadius: radius.panel, borderWidth: 1, borderColor: colors.rule, padding: space.md },
  body: { fontSize: type.body, color: colors.ink, lineHeight: 22 },
  muted: { fontSize: type.small, color: colors.inkSoft, lineHeight: 20 },
  stamp: { fontWeight: "900", letterSpacing: 1.5, color: colors.ink },
  row: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  rowLabel: { fontSize: type.body, color: colors.inkSoft, flexShrink: 1 },
  rowValue: { fontSize: type.body, color: colors.ink, fontWeight: "600", textAlign: "right", flexShrink: 1 },
  item: {
    backgroundColor: colors.paper,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.rule,
    padding: space.lg,
    gap: space.sm,
  },
});
