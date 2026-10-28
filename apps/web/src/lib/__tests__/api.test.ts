import { describe, expect, it } from "vitest";
import { api, ApiError, call, setAccessToken, upload } from "../api";
import { json, requestsTo, route } from "@/test/server";

describe("call", () => {
  it("returns the data of a successful request with the session token", async () => {
    setAccessToken("token-1");
    route("GET /api/v1/me", { id: "u1", role: "COLLECTOR" });

    await expect(call(api.GET("/api/v1/me"))).resolves.toMatchObject({ id: "u1" });
    expect(requestsTo("GET /api/v1/me")[0].headers.get("Authorization")).toBe("Bearer token-1");
    setAccessToken(null);
  });

  it("throws the problem's code, detail and field errors", async () => {
    route("GET /api/v1/me", () =>
      json(422, { code: "VALIDATION", title: "Invalid", detail: "Check the form", errors: { phone: "invalid" } }),
    );
    const error = await call(api.GET("/api/v1/me")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: "VALIDATION", message: "Check the form", fields: { phone: "invalid" } });
  });

  it("names the HTTP status when the body is not a problem", async () => {
    route("GET /api/v1/me", () => new Response("<html/>", { status: 503, statusText: "Service Unavailable" }));
    await expect(call(api.GET("/api/v1/me"))).rejects.toMatchObject({ code: "HTTP_503" });
  });
});

describe("upload", () => {
  it("posts the form with the token and returns the saved resource", async () => {
    setAccessToken("token-2");
    route("POST /api/v1/lots/l1/lab-result", { id: "r1" });
    const form = new FormData();
    form.append("labName", "Lab A");

    await expect(upload("/api/v1/lots/l1/lab-result", form)).resolves.toEqual({ id: "r1" });
    const [request] = requestsTo("POST /api/v1/lots/l1/lab-result");
    expect(request.headers.get("Authorization")).toBe("Bearer token-2");
    expect((await request.formData()).get("labName")).toBe("Lab A");
    setAccessToken(null);
  });

  it("throws an ApiError when the server refuses", async () => {
    route("POST /x", () => json(413, { code: "FILE_TOO_LARGE", detail: "Max 20 MB" }));
    await expect(upload("/x", new FormData())).rejects.toMatchObject({ status: 413, code: "FILE_TOO_LARGE" });
  });
});
