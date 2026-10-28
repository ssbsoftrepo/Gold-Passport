import * as Sentry from "@sentry/react";
import type { Breadcrumb, ErrorEvent } from "@sentry/react";

/**
 * Error reports from browsers, sent to Sentry when the build sets `NEXT_PUBLIC_SENTRY_DSN`
 * (see docs/monitoring.md). Without it nothing is sent.
 *
 * Reports hold no personal data (Ley 29733): no user, console output or clicked elements; URLs
 * are reduced to their pattern; server messages, which may name people, are never sent.
 */

const ID = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi;

export function initMonitoring(dsn = process.env.NEXT_PUBLIC_SENTRY_DSN): boolean {
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // No user details, cookies, bodies, query strings or headers other than the browser's name.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ["User-Agent"] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
  });
  return true;
}

/** Keeps the page or endpoint, drops ids, query strings (passport codes, searches) and fragments. */
export function scrubUrl(url: string): string {
  return url.split(/[?#]/)[0].replace(ID, "/:id");
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const category = breadcrumb.category ?? "";
  // Console output and clicked or typed-in elements can show names, phone numbers and amounts.
  if (category === "console" || category.startsWith("ui.")) return null;
  if (!breadcrumb.data) return breadcrumb;
  const data = { ...breadcrumb.data };
  for (const key of ["url", "from", "to"]) {
    if (typeof data[key] === "string") data[key] = scrubUrl(data[key]);
  }
  return { ...breadcrumb, data };
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const scrubbed: ErrorEvent = { ...event, user: undefined };
  if (scrubbed.request) {
    scrubbed.request = {
      ...scrubbed.request,
      url: scrubbed.request.url ? scrubUrl(scrubbed.request.url) : undefined,
      query_string: undefined,
      headers: scrubbed.request.headers?.["Referer"]
        ? { ...scrubbed.request.headers, Referer: scrubUrl(scrubbed.request.headers["Referer"]) }
        : scrubbed.request.headers,
    };
  }
  if (scrubbed.breadcrumbs) {
    scrubbed.breadcrumbs = scrubbed.breadcrumbs.map(scrubBreadcrumb).filter((b): b is Breadcrumb => b !== null);
  }
  if (scrubbed.exception?.values) {
    scrubbed.exception = {
      ...scrubbed.exception,
      // An ApiError's message is the server's text, which may name people.
      values: scrubbed.exception.values.map((v) => (v.type === "ApiError" ? { ...v, value: "(server message removed)" } : v)),
    };
  }
  return scrubbed;
}

/** Reports an error a React error boundary caught (those never reach the browser's error handler). */
export function reportError(error: unknown) {
  Sentry.captureException(error);
}
