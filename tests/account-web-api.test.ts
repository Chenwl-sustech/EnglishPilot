import { expect, test } from "vitest";
import { createApiFetch } from "../src/lib/native/api";
test("account web requests attach only the current session to approved relative routes", async () => {
  const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
  const api = createApiFetch({
    native: false,
    accountToken: async () => "user-session",
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return Response.json({ ok: true });
    },
  });
  expect(
    (
      await api("/api/teacher", {
        method: "POST",
        body: "{}",
        headers: { Authorization: "bad", "Content-Type": "application/json" },
      })
    ).status,
  ).toBe(200);
  expect(new Headers(calls[0].init?.headers).get("authorization")).toBe(
    "Bearer user-session",
  );
  for (const path of [
    "https://evil.test/api/teacher",
    "/api/teacher?url=https://evil.test",
    "/api/bootstrap",
  ])
    expect((await api(path)).status).toBe(503);
  expect(calls).toHaveLength(1);
});
test("logged out web reports AI unavailable without making a request", async () => {
  const api = createApiFetch({
    native: false,
    accountToken: async () => null,
    fetcher: async () => {
      throw Error("must not fetch");
    },
  });
  expect((await (await api("/api/evaluate")).json()).configured).toBe(false);
  expect(
    (await api("/api/teacher", { method: "POST", body: "{}" })).status,
  ).toBe(401);
});
test("native pairing remains authoritative when an account-token supplier is also present", async () => {
  let tokenReads = 0;
  const api = createApiFetch({
    native: true,
    accountToken: async () => {
      tokenReads++;
      return "must-not-use";
    },
    transport: async () => ({ status: 200, body: '{"configured":true}' }),
    fetcher: async () => {
      throw Error("must not fetch");
    },
  });
  expect((await (await api("/api/evaluate")).json()).configured).toBe(true);
  expect(tokenReads).toBe(0);
});
