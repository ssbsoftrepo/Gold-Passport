import createClient, { type Middleware } from "openapi-fetch";
import { Platform } from "react-native";
import type { components, paths } from "@/api/schema";

/**
 * Typed client generated from api/openapi.yaml (`npm run api:generate`).
 * Android emulators reach the host machine at 10.0.2.2; on a real phone set
 * EXPO_PUBLIC_API_BASE_URL to your computer's LAN address, e.g. http://192.168.1.20:8080.
 */
export type Schemas = components["schemas"];

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? (Platform.OS === "android" ? "http://10.0.2.2:8080" : "http://localhost:8080");

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function authHeaders(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

const auth: Middleware = {
  onRequest({ request }) {
    if (accessToken) request.headers.set("Authorization", `Bearer ${accessToken}`);
    return request;
  },
};

export const api = createClient<paths>({ baseUrl: API_BASE_URL });
api.use(auth);

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function toApiError(status: number, body: unknown, fallback: string): ApiError {
  const p = (body ?? {}) as Partial<Schemas["Problem"]>;
  return new ApiError(status, p.code ?? `HTTP_${status}`, p.detail ?? p.title ?? fallback);
}

export async function call<T>(request: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await request;
  if (!response.ok) throw toApiError(response.status, error, response.statusText);
  return data as T;
}

/** True when the request never reached the server (offline, DNS, timeout). */
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError || (e instanceof Error && /network request failed/i.test(e.message));
}

export type UploadFile = { uri: string; name: string; type: string };

/** Multipart upload using React Native's FormData file descriptor. */
export async function uploadMultipart<T>(path: string, file: UploadFile, fields: Record<string, string>): Promise<T> {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  // React Native accepts { uri, name, type } objects as file parts.
  form.append("file", file as unknown as Blob);
  const response = await fetch(`${API_BASE_URL}${path}`, { method: "POST", body: form, headers: authHeaders() });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw toApiError(response.status, body, response.statusText);
  return body as T;
}

/** POST a JSON body to a path (used by the offline outbox, which stores raw paths). */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw toApiError(response.status, json, response.statusText);
  return json as T;
}
