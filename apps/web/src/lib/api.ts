import createClient, { type Middleware } from "openapi-fetch";
import type { components, paths } from "@/api/schema";

/**
 * Typed API client. Types are generated from api/openapi.yaml (`npm run api:generate`), so a
 * contract change that breaks the web app fails `npm run typecheck`.
 */
export type Schemas = components["schemas"];

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

const authMiddleware: Middleware = {
  onRequest({ request }) {
    if (accessToken) {
      request.headers.set("Authorization", `Bearer ${accessToken}`);
    }
    return request;
  },
};

export const api = createClient<paths>({ baseUrl: API_BASE_URL });
api.use(authMiddleware);

/** An RFC 7807 error from the backend. `code` is stable and translated in the UI. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    // Crash reports name the error by this; monitoring.ts removes an ApiError's message (the server's text).
    this.name = "ApiError";
  }
}

type Problem = Partial<Schemas["Problem"]>;

function toApiError(response: Response, error: unknown): ApiError {
  const p = (error ?? {}) as Problem;
  return new ApiError(
    response.status,
    p.code ?? `HTTP_${response.status}`,
    p.detail ?? p.title ?? response.statusText,
    p.errors ?? undefined,
  );
}

/** Unwraps an openapi-fetch result: returns data or throws {@link ApiError}. */
export async function call<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await request;
  if (!response.ok) {
    throw toApiError(response, error);
  }
  return data as T;
}

/** Multipart upload (documents, lab reports). */
export async function upload<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    body: form,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw toApiError(response, body);
  }
  return body as T;
}

/** Downloads a protected file with the bearer token and opens it in a new tab. */
export async function openFile(fileId: string) {
  const response = await fetch(`${API_BASE_URL}/api/v1/files/${fileId}/content`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (!response.ok) {
    throw toApiError(response, await response.json().catch(() => ({})));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
