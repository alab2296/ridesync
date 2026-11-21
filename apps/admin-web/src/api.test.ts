import { afterEach, describe, expect, it, vi } from "vitest";
import { listRides, login } from "./api";

function mockFetch(status: number, body: unknown) {
  const fn = vi
    .fn<(url: string, init: { headers: Record<string, string> }) => Promise<Response>>()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("logs in and returns the token", async () => {
    const fn = mockFetch(200, { token: "abc", user: {} });
    await expect(login("a@b.co", "pw")).resolves.toBe("abc");
    expect(fn.mock.calls[0]?.[0]).toBe("/api/auth/login");
  });

  it("sends the bearer token and filter when listing rides", async () => {
    const fn = mockFetch(200, { rides: [] });
    await listRides("tok", { status: "COMPLETED", limit: 10 });
    const call = fn.mock.calls[0];
    expect(call?.[0]).toBe("/api/admin/rides?status=COMPLETED&limit=10");
    expect(call?.[1].headers.authorization).toBe("Bearer tok");
  });

  it("turns an error response into an ApiError", async () => {
    mockFetch(401, { error: { code: "INVALID_CREDENTIALS", message: "Wrong email or password" } });
    await expect(login("a@b.co", "bad")).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
    });
  });
});
