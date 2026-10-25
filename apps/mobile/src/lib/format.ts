import type { Locale } from "./i18n";

const tag = (l: Locale) => (l === "es" ? "es-PE" : "en-GB");

export function formatDateTime(value: string | null | undefined, locale: Locale): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatDate(value: string | null | undefined, locale: Locale): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium" }).format(new Date(value));
}

export function formatNumber(value: number | null | undefined, locale: Locale, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(tag(locale), { maximumFractionDigits: digits }).format(value);
}

export function formatMoney(value: number | null | undefined, currency: string | null | undefined, locale: Locale) {
  if (value === null || value === undefined || !currency) return "—";
  return new Intl.NumberFormat(tag(locale), { style: "currency", currency }).format(value);
}

/** Accepts "92,5" or "92.5". */
export function parseDecimal(text: string): number {
  return Number(text.trim().replace(",", "."));
}

export function tone(status: string): "good" | "bad" | "wait" | "neutral" {
  if (["APPROVED", "CONFIRMED", "COMPLETED", "DELIVERED", "LAB_APPROVED", "AGREED", "PAID", "SETTLED"].includes(status)) return "good";
  if (["REJECTED", "DECLINED", "CANCELLED", "LAB_DISCREPANCY", "DISPUTED"].includes(status)) return "bad";
  if (["PENDING_CONFIRMATION", "PENDING_REVIEW", "CLARIFICATION_REQUESTED", "PROPOSED", "MINER_ACCEPTED", "AT_MINER", "SUBMITTED", "CORRECTIONS_REQUESTED"].includes(status)) return "wait";
  return "neutral";
}
