import type { Locale } from "./i18n";

const tag = (locale: Locale) => (locale === "es" ? "es-PE" : "en-GB");

export function formatDate(value: string | null | undefined, locale: Locale): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium" }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined, locale: Locale): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatNumber(value: number | null | undefined, locale: Locale, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(tag(locale), { maximumFractionDigits: digits }).format(value);
}

export function formatMoney(value: number | null | undefined, currency: string | null | undefined, locale: Locale) {
  if (value === null || value === undefined || !currency) return "—";
  return new Intl.NumberFormat(tag(locale), { style: "currency", currency }).format(value);
}

export function formatCoords(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

export function mapsUrl(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`;
}

export function shortHash(hash: string | null | undefined): string {
  return hash ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : "—";
}

/** Tone of a status tag. */
export function statusTone(status: string): "good" | "bad" | "wait" | "gold" | "neutral" {
  if (["APPROVED", "CONFIRMED", "COMPLETED", "DELIVERED", "LAB_APPROVED", "AGREED", "PAID", "DISCREPANCY_RESOLVED"].includes(status)) {
    return "good";
  }
  if (["REJECTED", "DECLINED", "CANCELLED", "LAB_DISCREPANCY", "DISCREPANCY_OPEN", "DISPUTED"].includes(status)) {
    return "bad";
  }
  if (["SETTLED"].includes(status)) return "gold";
  if (["SUBMITTED", "PENDING_REVIEW", "PENDING_CONFIRMATION", "CORRECTIONS_REQUESTED", "CLARIFICATION_REQUESTED", "PROPOSED", "MINER_ACCEPTED", "ARRIVED_AT_COLLECTOR", "AT_MINER"].includes(status)) {
    return "wait";
  }
  return "neutral";
}
