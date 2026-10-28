import * as Sentry from "@sentry/react";
import type { ErrorEvent } from "@sentry/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { initMonitoring, scrubBreadcrumb, scrubEvent, scrubUrl } from "../monitoring";

vi.mock("@sentry/react", () => ({ init: vi.fn(), captureException: vi.fn() }));

const ID = "5bd345da-8e7f-4b1c-9d2a-0123456789ab";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("initMonitoring", () => {
  it("sends nothing unless the build has a DSN", () => {
    expect(initMonitoring(undefined)).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("starts Sentry without user details, cookies, bodies, query strings or tracing", () => {
    expect(initMonitoring("https://key@o1.ingest.sentry.io/1")).toBe(true);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dataCollection: expect.objectContaining({ userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false }),
        tracesSampleRate: 0,
        beforeSend: scrubEvent,
        beforeBreadcrumb: scrubBreadcrumb,
      }),
    );
  });
});

describe("scrubbing", () => {
  it("reduces URLs to their pattern", () => {
    expect(scrubUrl(`https://app.example.pe/admin/lots/${ID}?tab=ledger#x`)).toBe("https://app.example.pe/admin/lots/:id");
    expect(scrubUrl(`/api/v1/admin/participants/${ID}/documents/${ID}`)).toBe("/api/v1/admin/participants/:id/documents/:id");
  });

  it("drops console output and clicks, and scrubs request and navigation URLs", () => {
    expect(scrubBreadcrumb({ category: "console", message: "Rosa Quispe" })).toBeNull();
    expect(scrubBreadcrumb({ category: "ui.click", message: "button.approve" })).toBeNull();
    expect(scrubBreadcrumb({ category: "ui.input", message: "input[name=phone]" })).toBeNull();
    expect(scrubBreadcrumb({ category: "fetch", data: { method: "GET", url: `https://api.example.pe/api/v1/lots/${ID}?q=Rosa` } })).toEqual({
      category: "fetch",
      data: { method: "GET", url: "https://api.example.pe/api/v1/lots/:id" },
    });
    expect(scrubBreadcrumb({ category: "navigation", data: { from: `/admin/lots/${ID}`, to: "/admin/participants?q=Rosa" } })).toEqual({
      category: "navigation",
      data: { from: "/admin/lots/:id", to: "/admin/participants" },
    });
  });

  it("removes the user, query strings and server messages from an event", () => {
    const apiError = new ApiError(409, "INVALID_STATE", "Lot already sold to Rosa Quispe");
    const event = {
      type: undefined,
      user: { id: "u1", ip_address: "{{auto}}" },
      request: {
        url: `https://app.example.pe/admin/lots/${ID}?q=Rosa`,
        query_string: "q=Rosa",
        headers: { Referer: `https://app.example.pe/admin/participants/${ID}`, "User-Agent": "Firefox" },
      },
      breadcrumbs: [{ category: "console", message: "+51987654321" }],
      exception: { values: [{ type: apiError.name, value: apiError.message }, { type: "TypeError", value: "x is undefined" }] },
    } as ErrorEvent;

    const scrubbed = scrubEvent(event);

    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.request).toEqual({
      url: "https://app.example.pe/admin/lots/:id",
      query_string: undefined,
      headers: { Referer: "https://app.example.pe/admin/participants/:id", "User-Agent": "Firefox" },
    });
    expect(scrubbed.breadcrumbs).toEqual([]);
    expect(scrubbed.exception?.values?.map((v) => v.value)).toEqual(["(server message removed)", "x is undefined"]);
    expect(JSON.stringify(scrubbed)).not.toMatch(/Rosa|\+519/);
  });
});
