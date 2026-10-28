import { File } from "expo-file-system";
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
const tokenListeners = new Set<(token: string | null) => void>();

export function setAccessToken(token: string | null) {
  accessToken = token;
  tokenListeners.forEach((l) => l(token));
}

/** Lets the outbox resume after the user signs in again (e.g. the token expired while offline). */
export function onAccessTokenChange(listener: (token: string | null) => void): () => void {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
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

/**
 * On a weak signal a request can hang for minutes without failing. Every request therefore has a
 * deadline; when it passes the request is aborted and reported as a {@link NetworkError}, so screens
 * fall back to saved data and the outbox keeps the action for a later retry.
 */
export const REQUEST_TIMEOUT_MS = 20_000;

/** Uploads get a minute plus time for the file at ~8 KB/s (a weak 2G/EDGE connection). */
export function uploadTimeoutMs(bytes: number): number {
  return 60_000 + Math.ceil(bytes / 8);
}

/** The request never got a usable answer from the server: offline, DNS failure, dropped or timed out. */
export class NetworkError extends Error {
  readonly code = "NETWORK";
  constructor(
    message: string,
    public readonly timedOut = false,
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

export async function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e) {
    if (timedOut) throw new NetworkError(`No answer from the server after ${Math.round(timeoutMs / 1000)} s`, true);
    if (e instanceof TypeError) throw new NetworkError(e.message);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const api = createClient<paths>({ baseUrl: API_BASE_URL, fetch: (request) => fetchWithTimeout(request) });
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

/** True when the request got no answer from the server (offline, DNS, timeout). */
export function isNetworkError(e: unknown): boolean {
  return e instanceof NetworkError || e instanceof TypeError || (e instanceof Error && /network request failed/i.test(e.message));
}

/**
 * True when sending the same request again later may succeed: no answer, a server or gateway error,
 * rate limiting, or the server still working on an earlier attempt with the same idempotency key.
 */
export function isTransientError(e: unknown): boolean {
  if (isNetworkError(e)) return true;
  if (!(e instanceof ApiError)) return false;
  return e.status >= 500 || e.status === 408 || e.status === 429 || e.code === "IDEMPOTENCY_KEY_IN_USE";
}

/** Header that makes a POST safe to repeat: the server answers a repeated key with the first result. */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

function idempotencyHeaders(key?: string): Record<string, string> {
  return key ? { [IDEMPOTENCY_HEADER]: key } : {};
}

function fileSize(uri: string): number {
  try {
    return new File(uri).size;
  } catch {
    return 0;
  }
}

export type UploadFile = { uri: string; name: string; type: string };

/** Multipart upload using React Native's FormData file descriptor. */
export async function uploadMultipart<T>(
  path: string,
  file: UploadFile,
  fields: Record<string, string>,
  idempotencyKey?: string,
): Promise<T> {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  // React Native accepts { uri, name, type } objects as file parts.
  form.append("file", file as unknown as Blob);
  const response = await fetchWithTimeout(
    `${API_BASE_URL}${path}`,
    { method: "POST", body: form, headers: { ...authHeaders(), ...idempotencyHeaders(idempotencyKey) } },
    uploadTimeoutMs(fileSize(file.uri)),
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw toApiError(response.status, body, response.statusText);
  return body as T;
}

/** POST a JSON body to a path (used by the offline outbox, which stores raw paths). */
export async function postJson<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(), ...idempotencyHeaders(idempotencyKey) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw toApiError(response.status, json, response.statusText);
  return json as T;
}
