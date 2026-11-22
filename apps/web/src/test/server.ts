import { vi } from "vitest";

/**
 * A fake backend for tests: routes "METHOD /path" to handlers and records every request.
 * The API client keeps the fetch it was created with, so the stub is installed once, before any
 * app module loads, and only the routes change between tests.
 */

type Handler = (request: Request) => Response | Promise<Response>;

const routes = new Map<string, Handler>();
export const requests: Request[] = [];

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Registers a handler for e.g. `GET /api/v1/lots/l1/lab-result`. */
export function route(key: string, handler: Handler | unknown) {
  routes.set(key, typeof handler === "function" ? (handler as Handler) : () => json(200, handler));
}

export function resetServer() {
  routes.clear();
  requests.length = 0;
}

/** The requests made to `METHOD /path`. */
export function requestsTo(key: string): Request[] {
  return requests.filter((r) => `${r.method} ${new URL(r.url).pathname}` === key);
}

vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  requests.push(request.clone());
  const key = `${request.method} ${new URL(request.url).pathname}`;
  const handler = routes.get(key);
  if (!handler) return json(404, { code: "NOT_FOUND", title: `No test route for ${key}` });
  return handler(request);
});
