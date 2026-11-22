import { File } from "expo-file-system";
import createClient from "openapi-fetch";
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

/**
 * Gets a new access token without asking the user (Cognito refresh token). Resolves to null when
 * that is impossible and the user has to sign in again; throws a {@link NetworkError} when the
 * sign-in service cannot be reached, so callers retry later instead of signing the user out.
 */
export type TokenRenewer = () => Promise<string | null>;

let renewer: TokenRenewer | null = null;
let renewing: Promise<string | null> | null = null;
let lastRenewedAt = 0;

/** Renew this long before the token expires, so a large upload does not go out with a dying token. */
const RENEW_BEFORE_EXPIRY_MS = 2 * 60_000;
/** A phone clock that is far off makes every token look expired; renew at most this often then. */
const MIN_RENEW_INTERVAL_MS = 5 * 60_000;

export function setTokenRenewer(next: TokenRenewer | null) {
  renewer = next;
}

/** One renewal at a time, shared by every request that needs it. */
function renewAccessToken(): Promise<string | null> {
  if (!renewer) return Promise.resolve(null);
  renewing ??= renewer()
    .then((token) => {
      if (token) lastRenewedAt = Date.now();
      return token;
    })
    .finally(() => {
      renewing = null;
    });
  return renewing;
}

/** Expiry of a JWT in epoch milliseconds, or null when it cannot be read. */
function tokenExpiry(token: string): number | null {
  try {
    const part = token.split(".")[1];
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const exp = (JSON.parse(atob(base64)) as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function expiresSoon(token: string): boolean {
  const expiry = tokenExpiry(token);
  return (
    expiry !== null && expiry - Date.now() < RENEW_BEFORE_EXPIRY_MS && Date.now() - lastRenewedAt > MIN_RENEW_INTERVAL_MS
  );
}

/**
 * Sends a request with the current token. A token about to expire is renewed first; one the server
 * refuses (it expired while the phone was offline, or the phone's clock is wrong) is renewed and the
 * request sent once more. Without a renewer (local mode) a 401 is returned as it is.
 */
async function sendAuthorized(send: (headers: Record<string, string>) => Promise<Response>): Promise<Response> {
  if (renewer && accessToken && expiresSoon(accessToken)) {
    // Without signal the renewal fails; send anyway, the token may still be accepted.
    await renewAccessToken().catch(() => undefined);
  }
  const used = accessToken;
  const response = await send(authHeaders());
  if (response.status !== 401 || !renewer || !used) return response;
  // Another request may have renewed the token meanwhile; otherwise renew it now.
  const renewed = accessToken !== used ? accessToken : await renewAccessToken();
  return renewed ? send(authHeaders()) : response;
}

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

export const api = createClient<paths>({
  baseUrl: API_BASE_URL,
  // Each attempt sends a copy: a request's body can only be read once.
  fetch: (request) =>
    sendAuthorized((headers) => {
      const attempt = request.clone();
      Object.entries(headers).forEach(([name, value]) => attempt.headers.set(name, value));
      return fetchWithTimeout(attempt);
    }),
});

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

/** 409 codes that mean "try again", not "this can never succeed". */
const RETRYABLE_CONFLICTS = new Set(["IDEMPOTENCY_KEY_IN_USE", "CONCURRENT_MODIFICATION"]);

/**
 * True when sending the same request again later may succeed: no answer, a server or gateway error,
 * rate limiting, the server still working on an earlier attempt with the same idempotency key, or a
 * write that lost an optimistic-locking race with someone else's change.
 */
export function isTransientError(e: unknown): boolean {
  if (isNetworkError(e)) return true;
  if (!(e instanceof ApiError)) return false;
  return e.status >= 500 || e.status === 408 || e.status === 429 || RETRYABLE_CONFLICTS.has(e.code);
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
  const response = await sendAuthorized((headers) =>
    fetchWithTimeout(
      `${API_BASE_URL}${path}`,
      { method: "POST", body: form, headers: { ...headers, ...idempotencyHeaders(idempotencyKey) } },
      uploadTimeoutMs(fileSize(file.uri)),
    ),
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw toApiError(response.status, body, response.statusText);
  return body as T;
}

/** POST a JSON body to a path (used by the offline outbox, which stores raw paths). */
export async function postJson<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
  const response = await sendAuthorized((headers) =>
    fetchWithTimeout(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers, ...idempotencyHeaders(idempotencyKey) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw toApiError(response.status, json, response.statusText);
  return json as T;
}
