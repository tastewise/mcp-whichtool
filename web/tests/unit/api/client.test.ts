import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ApiError, errorText, fetchJson } from "@/api/client";
import { server } from "../support/msw";

describe("fetchJson", () => {
  it("sends JSON and returns the payload", async () => {
    server.use(http.post("/api/echo", async ({ request }) => HttpResponse.json({ got: await request.json(), type: request.headers.get("content-type") })));
    await expect(fetchJson("POST", "/api/echo", { a: 1 })).resolves.toEqual({ got: { a: 1 }, type: "application/json" });
  });
  it("throws status and payload on a non-2xx", async () => {
    server.use(http.get("/api/nope", () => HttpResponse.json({ detail: "gone" }, { status: 409 })));
    const error = (await fetchJson("GET", "/api/nope").catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.payload).toEqual({ detail: "gone" });
    expect(errorText(error)).toBe("gone");
  });
  it("tolerates a non-JSON error body", async () => {
    server.use(http.get("/api/html", () => new HttpResponse("<h1>boom</h1>", { status: 502 })));
    const error = (await fetchJson("GET", "/api/html").catch((e) => e)) as ApiError;
    expect(error.payload).toEqual({});
    expect(errorText(error)).toBe("502");
  });
});
