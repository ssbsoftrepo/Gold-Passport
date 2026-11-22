import {
  ApiError,
  IDEMPOTENCY_HEADER,
  NetworkError,
  REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
  isNetworkError,
  isTransientError,
  onAccessTokenChange,
  postJson,
  setAccessToken,
  toApiError,
  uploadMultipart,
  uploadTimeoutMs,
} from "../api";
import { fakeFiles } from "@/test/fileSystem";

const fetchMock = jest.fn<Promise<Response>, [RequestInfo, RequestInit?]>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A fetch that never answers until its request is aborted, like a request on a dead signal. */
function hangingFetch(_input: RequestInfo, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  setAccessToken(null);
  fakeFiles.reset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("fetchWithTimeout", () => {
  it("gives up after the deadline and reports a timed-out network error", async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(hangingFetch);
    const result = fetchWithTimeout("https://api.test/x");
    const assertion = expect(result).rejects.toMatchObject({ name: "NetworkError", timedOut: true });
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it("uses the given deadline instead of the default", async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(hangingFetch);
    let settled = false;
    const result = fetchWithTimeout("https://api.test/x", {}, 90_000).finally(() => (settled = true));
    result.catch(() => undefined);
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(90_000 - REQUEST_TIMEOUT_MS);
    await expect(result).rejects.toBeInstanceOf(NetworkError);
  });

  it("turns a failed connection (TypeError) into a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    await expect(fetchWithTimeout("https://api.test/x")).rejects.toMatchObject({ name: "NetworkError", timedOut: false });
  });

  it("passes other errors through unchanged", async () => {
    const error = new Error("boom");
    fetchMock.mockRejectedValue(error);
    await expect(fetchWithTimeout("https://api.test/x")).rejects.toBe(error);
  });

  it("returns the response, whatever its status", async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, {}));
    expect((await fetchWithTimeout("https://api.test/x")).status).toBe(503);
  });
});

describe("uploadTimeoutMs", () => {
  it("allows a minute plus the file at 8 KB/s", () => {
    expect(uploadTimeoutMs(0)).toBe(60_000);
    expect(uploadTimeoutMs(400_000)).toBe(110_000);
  });
});

describe("toApiError", () => {
  it("keeps the problem code and detail", () => {
    const e = toApiError(422, { code: "LOT_INCOMPLETE", title: "Unprocessable", detail: "Add a photo" }, "x");
    expect(e).toMatchObject({ status: 422, code: "LOT_INCOMPLETE", message: "Add a photo", name: "ApiError" });
  });

  it("falls back to the HTTP status and text when the body is not a problem", () => {
    expect(toApiError(502, undefined, "Bad Gateway")).toMatchObject({ code: "HTTP_502", message: "Bad Gateway" });
  });
});

describe("isTransientError", () => {
  it.each([
    ["no answer", new NetworkError("offline"), true],
    ["timeout", new NetworkError("slow", true), true],
    ["a raw fetch failure", new TypeError("Network request failed"), true],
    ["a server error", new ApiError(500, "HTTP_500", "x"), true],
    ["a gateway error", new ApiError(503, "HTTP_503", "x"), true],
    ["rate limiting", new ApiError(429, "HTTP_429", "x"), true],
    ["a request timeout", new ApiError(408, "HTTP_408", "x"), true],
    ["an earlier attempt still running", new ApiError(409, "IDEMPOTENCY_KEY_IN_USE", "x"), true],
    ["a lost optimistic-lock race", new ApiError(409, "CONCURRENT_MODIFICATION", "x"), true],
    ["a wrong state", new ApiError(409, "INVALID_STATE", "x"), false],
    ["a validation error", new ApiError(422, "VALIDATION", "x"), false],
    ["a forbidden action", new ApiError(403, "FORBIDDEN", "x"), false],
    ["an expired session", new ApiError(401, "UNAUTHORIZED", "x"), false],
    ["a bug", new Error("undefined is not a function"), false],
  ])("%s → %s", (_name, error, expected) => {
    expect(isTransientError(error)).toBe(expected);
  });

  it("treats only missing answers as network errors", () => {
    expect(isNetworkError(new NetworkError("x"))).toBe(true);
    expect(isNetworkError(new ApiError(503, "HTTP_503", "x"))).toBe(false);
  });
});

describe("access token", () => {
  it("tells listeners about sign-in and sign-out until they unsubscribe", () => {
    const listener = jest.fn();
    const unsubscribe = onAccessTokenChange(listener);
    setAccessToken("t1");
    setAccessToken(null);
    unsubscribe();
    setAccessToken("t2");
    expect(listener.mock.calls).toEqual([["t1"], [null]]);
  });
});

describe("postJson", () => {
  it("sends the body with the session token and the idempotency key", async () => {
    setAccessToken("token-1");
    fetchMock.mockResolvedValue(jsonResponse(201, { id: "c1" }));

    await expect(postJson("/api/v1/transports/t1/checkpoints", { lat: -12 }, "key-1")).resolves.toEqual({ id: "c1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/transports\/t1\/checkpoints$/);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ lat: -12 }));
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer token-1",
      [IDEMPOTENCY_HEADER]: "key-1",
      "Content-Type": "application/json",
    });
  });

  it("sends no idempotency key or token when there is none", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await postJson("/x", undefined);
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers).not.toHaveProperty(IDEMPOTENCY_HEADER);
    expect(headers).not.toHaveProperty("Authorization");
  });

  it("throws the server's problem as an ApiError", async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { code: "INVALID_STATE", detail: "Already delivered" }));
    await expect(postJson("/x", {})).rejects.toMatchObject({ status: 409, code: "INVALID_STATE", message: "Already delivered" });
  });

  it("copes with an error page that is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502, statusText: "Bad Gateway" }));
    const error = await postJson("/x", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(isTransientError(error)).toBe(true);
  });
});

describe("uploadMultipart", () => {
  it("posts the file and fields with the idempotency key", async () => {
    setAccessToken("token-1");
    fakeFiles.write("file:///cache/photo.jpg", 400_000);
    fetchMock.mockResolvedValue(jsonResponse(201, { fileId: "f1" }));

    const result = await uploadMultipart(
      "/api/v1/lots/l1/evidence",
      { uri: "file:///cache/photo.jpg", name: "photo.jpg", type: "image/jpeg" },
      { kind: "EXTRACTION_PHOTO" },
      "key-2",
    );

    expect(result).toEqual({ fileId: "f1" });
    const init = fetchMock.mock.calls[0][1];
    expect(init?.headers).toMatchObject({ Authorization: "Bearer token-1", [IDEMPOTENCY_HEADER]: "key-2" });
    const form = init?.body as FormData;
    expect(form.get("kind")).toBe("EXTRACTION_PHOTO");
    // React Native's FormData sends { uri, name, type } as a file; the test runtime's only records it.
    expect(form.has("file")).toBe(true);
  });

  it("gives a large photo more time on a slow connection", async () => {
    jest.useFakeTimers();
    fakeFiles.write("file:///cache/big.jpg", 2_000_000);
    fetchMock.mockImplementation(hangingFetch);
    let settled = false;
    const upload = uploadMultipart("/x", { uri: "file:///cache/big.jpg", name: "big.jpg", type: "image/jpeg" }, {}).finally(
      () => (settled = true),
    );
    upload.catch(() => undefined);

    await jest.advanceTimersByTimeAsync(uploadTimeoutMs(2_000_000) - 1);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await expect(upload).rejects.toMatchObject({ timedOut: true });
  });
});
