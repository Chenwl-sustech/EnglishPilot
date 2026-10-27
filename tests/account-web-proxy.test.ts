import { expect, test } from "vitest";
import { accountWebResponse } from "../web-cloud/server/proxy.mjs";

const uid = "11111111-1111-4111-8111-111111111111";
const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_public_123456789",
  ENGLISHPILOT_ALLOWED_USERS: uid,
  AI_BACKEND_ORIGIN: "https://fixture.vercel.app",
  AI_BACKEND_TOKEN: "private-fixture-backend-token-123456789",
};
const request = (
  path = "/api/teacher",
  token = "fixture-user-jwt",
  body = "{}",
) =>
  new Request(`https://app.test${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: "https://app.test",
      Cookie: "must-not-forward=1",
    },
    body,
  });
test("missing configuration, missing auth and unapproved accounts never call the AI backend", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json({
      id: "22222222-2222-4222-8222-222222222222",
      is_anonymous: false,
    });
  };
  expect((await accountWebResponse(request(), {}, fetcher)).status).toBe(503);
  expect(
    (
      await accountWebResponse(
        new Request("https://app.test/api/evaluate"),
        env,
        fetcher,
      )
    ).status,
  ).toBe(401);
  expect(calls).toBe(0);
  expect((await accountWebResponse(request(), env, fetcher)).status).toBe(403);
  expect(calls).toBe(1);
});
test("a verified approved account sends only a server credential to the fixed AI origin", async () => {
  const calls: Request[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const r = new Request(input, init);
    calls.push(r);
    if (r.url === "https://test.supabase.co/auth/v1/user")
      return Response.json({ id: uid, is_anonymous: false });
    return Response.json({ reply: "Hello", debug: env.AI_BACKEND_TOKEN });
  };
  const response = await accountWebResponse(request(), env, fetcher);
  expect(response.status).toBe(200);
  expect(calls[0].headers.get("authorization")).toBe("Bearer fixture-user-jwt");
  expect(calls[0].headers.get("apikey")).toBe(env.SUPABASE_PUBLISHABLE_KEY);
  expect(calls[1].url).toBe("https://fixture.vercel.app/api/teacher");
  expect(calls[1].headers.get("authorization")).toBe(
    `Bearer ${env.AI_BACKEND_TOKEN}`,
  );
  expect(calls[1].headers.get("origin")).toBeNull();
  expect(calls[1].headers.get("cookie")).toBeNull();
  expect(await calls[1].text()).toBe("{}");
  expect(await response.text()).not.toContain(env.AI_BACKEND_TOKEN);
  expect(response.headers.get("cache-control")).toContain("no-store");
});
test("unapproved routes, query URLs and oversized input never reach authentication or AI", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    throw Error("unexpected");
  };
  for (const path of [
    "/api/bootstrap",
    "/api/teacher?url=https://evil.test",
    "/api/whisper",
  ])
    expect((await accountWebResponse(request(path), env, fetcher)).status).toBe(
      404,
    );
  expect(
    (
      await accountWebResponse(
        request(
          "/api/teacher",
          "jwt",
          JSON.stringify({ text: "x".repeat(200001) }),
        ),
        env,
        fetcher,
      )
    ).status,
  ).toBe(413);
  expect(calls).toBe(0);
});
test("invalid sessions and upstream HTML cannot become a successful AI reply", async () => {
  expect(
    (
      await accountWebResponse(request(), env, async () =>
        Response.json({ error: "invalid" }, { status: 401 }),
      )
    ).status,
  ).toBe(401);
  let calls = 0;
  const response = await accountWebResponse(request(), env, async () =>
    ++calls === 1
      ? Response.json({ id: uid, is_anonymous: false })
      : new Response("<html>login</html>", {
          headers: { "content-type": "text/html" },
        }),
  );
  expect(response.status).toBe(502);
});

test("paired native device reaches the existing backend without forwarding its own credential", async () => {
  const deviceToken = "fixture-native-device-token-0123456789abcdef";
  const privateEnv = { ...env, NATIVE_DEVICE_TOKEN: deviceToken };
  const calls: Request[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const r = new Request(input, init);
    calls.push(r);
    return Response.json({
      reply: "Hello",
      debug: `${env.AI_BACKEND_TOKEN} ${deviceToken}`,
    });
  };
  const native = request("/api/teacher", deviceToken);
  native.headers.delete("Origin");
  const response = await accountWebResponse(native, privateEnv, fetcher);
  expect(response.status).toBe(200);
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("https://fixture.vercel.app/api/teacher");
  expect(calls[0].headers.get("authorization")).toBe(
    `Bearer ${env.AI_BACKEND_TOKEN}`,
  );
  expect(calls[0].headers.get("cookie")).toBeNull();
  const text = await response.text();
  expect(text).not.toContain(deviceToken);
  expect(text).not.toContain(env.AI_BACKEND_TOKEN);
});

test("device token cannot authorize browser-origin requests or malformed device configuration", async () => {
  const token = "fixture-native-device-token-0123456789abcdef";
  const privateEnv = { ...env, NATIVE_DEVICE_TOKEN: token };
  let backendCalls = 0;
  const rejectUser: typeof fetch = async (input) => {
    if (String(input).startsWith(env.AI_BACKEND_ORIGIN)) backendCalls++;
    return Response.json({ error: "invalid" }, { status: 401 });
  };
  expect(
    (
      await accountWebResponse(
        request("/api/teacher", token),
        privateEnv,
        rejectUser,
      )
    ).status,
  ).toBe(403);
  for (const invalid of [
    "short",
    "invalid token with whitespace",
    "x".repeat(4097),
  ]) {
    const native = request("/api/teacher", invalid);
    native.headers.delete("Origin");
    expect(
      (
        await accountWebResponse(
          native,
          { ...env, NATIVE_DEVICE_TOKEN: invalid },
          rejectUser,
        )
      ).status,
    ).toBe(401);
  }
  expect(backendCalls).toBe(0);
});

test("paired native configuration check accepts its empty POST while other empty POSTs are rejected", async () => {
  const token = "fixture-native-device-token-0123456789abcdef";
  const privateEnv = { ...env, NATIVE_DEVICE_TOKEN: token };
  const sent: Request[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    sent.push(new Request(input, init));
    return Response.json({ ok: true });
  };
  const empty = (path: string) =>
    new Request(`https://app.test${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  expect(
    (await accountWebResponse(empty("/api/configuration"), privateEnv, fetcher))
      .status,
  ).toBe(200);
  expect(await sent[0].text()).toBe("{}");
  expect(
    (await accountWebResponse(empty("/api/teacher"), privateEnv, fetcher))
      .status,
  ).toBe(413);
});
