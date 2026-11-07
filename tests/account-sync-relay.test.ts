import { expect, test, vi } from "vitest";
import { syncGatewayResponse } from "../web-cloud/server/sync-proxy.mjs";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_123456789",
};
const base = "https://englishpilot-chenwl-sync.netlify.app/api/sync/test";
test("iPad native origin can preflight and read its authorized relay while foreign origins fail", async () => {
  const cors = await syncGatewayResponse(
    new Request(base + "/auth/v1/token", {
      method: "OPTIONS",
      headers: {
        origin: "capacitor://localhost",
        "access-control-request-method": "POST",
        "access-control-request-headers":
          "apikey,authorization,content-type,x-client-info",
      },
    }),
    env,
  );
  expect(cors.status).toBe(204);
  expect(cors.headers.get("access-control-allow-origin")).toBe(
    "capacitor://localhost",
  );
  const actual = await syncGatewayResponse(
    request("/auth/v1/settings", {
      headers: { origin: "capacitor://localhost" },
    }),
    env,
    async () => Response.json({ ok: true }),
  );
  expect(actual.status).toBe(200);
  expect(actual.headers.get("access-control-allow-origin")).toBe(
    "capacitor://localhost",
  );
  const invalid = await syncGatewayResponse(
    new Request(base + "/auth/v1/token", {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.test",
        "access-control-request-method": "POST",
      },
    }),
    env,
  );
  expect(invalid.status).toBe(403);
});
function request(path: string, init: RequestInit = {}) {
  return new Request(base + path, {
    ...init,
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      ...Object.fromEntries(new Headers(init.headers)),
    },
  });
}

test("relay forwards only its configured project and keeps login credentials in the HTTPS body", async () => {
  const calls: Array<[string, RequestInit]> = [];
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push([url, init]);
    return Response.json({ access_token: "synthetic-session" });
  };
  const response = await syncGatewayResponse(
    request("/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "do-not-forward",
        host: "evil.test",
      },
      body: '{"email":"fixture@example.test","password":"synthetic-password"}',
    }),
    env,
    fetcher,
  );
  expect(response.status).toBe(200);
  expect(calls[0][0]).toBe(
    env.SUPABASE_URL + "/auth/v1/token?grant_type=password",
  );
  expect(new TextDecoder().decode(calls[0][1].body as Uint8Array)).toContain(
    "synthetic-password",
  );
  expect(new Headers(calls[0][1].headers).has("cookie")).toBe(false);
  expect(new Headers(calls[0][1].headers).has("host")).toBe(false);
  expect(calls[0][1].redirect).toBe("error");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.has("set-cookie")).toBe(false);
});

test("relay rejects unconfigured projects, privileged paths, missing public key and missing user authorization before fetching", async () => {
  const fetcher = vi.fn(async () => Response.json({}));
  for (const req of [
    new Request(base.replace("/test", "/other") + "/auth/v1/settings", {
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY },
    }),
    request("/auth/v1/admin/users"),
    request("/rest/v1/unrelated"),
    request("/storage/v1/object/public/other/a"),
    new Request(base + "/auth/v1/settings"),
    request("/rest/v1/englishpilot_sync_heads"),
    request("/auth/v1/settings", { headers: { apikey: "wrong-project-key" } }),
    request("/auth/v1/settings", { headers: { origin: "https://evil.test" } }),
  ])
    expect(
      (await syncGatewayResponse(req, env, fetcher)).status,
    ).toBeGreaterThanOrEqual(400);
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    (await syncGatewayResponse(request("/auth/v1/settings"), {}, fetcher))
      .status,
  ).toBe(503);
});

test("relay retains four MiB multipart upload bytes and binary download bytes under the same user's authorization", async () => {
  const bytes = new Uint8Array(4 * 1024 * 1024).fill(255);
  bytes[0] = 0;
  const form = new FormData();
  form.append("file", new Blob([bytes]), "fixture.wav");
  const path =
    "/storage/v1/object/englishpilot-sync/11111111-1111-4111-8111-111111111111/chunks/" +
    "a".repeat(64);
  let uploaded = 0;
  const fetcher = async (_url: string, init: RequestInit) => {
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer synthetic-session",
    );
    if (init.method === "POST") {
      const parsed = await new Response(init.body, {
        headers: init.headers,
      }).formData();
      uploaded = (await (parsed.get("file") as File).arrayBuffer()).byteLength;
      return Response.json({ ok: true }, { status: 201 });
    }
    return new Response(bytes, {
      headers: {
        "content-type": "application/octet-stream",
        "set-cookie": "never-forward",
        "cache-control": "public,max-age=3600",
      },
    });
  };
  expect(
    (
      await syncGatewayResponse(
        request(path, {
          method: "POST",
          body: form,
          headers: { authorization: "Bearer synthetic-session" },
        }),
        env,
        fetcher,
      )
    ).status,
  ).toBe(201);
  expect(uploaded).toBe(bytes.byteLength);
  const response = await syncGatewayResponse(
    request(path, { headers: { authorization: "Bearer synthetic-session" } }),
    env,
    fetcher,
  );
  expect(
    Buffer.from(await response.arrayBuffer()).equals(Buffer.from(bytes)),
  ).toBe(true);
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("relay rejects redirects and oversize responses and request streams without exposing backend errors", async () => {
  const req = () => request("/auth/v1/settings");
  expect(
    (
      await syncGatewayResponse(
        req(),
        env,
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://evil.test" },
          }),
      )
    ).status,
  ).toBe(502);
  expect(
    (
      await syncGatewayResponse(
        req(),
        env,
        async () => new Response(new Uint8Array(4 * 1024 * 1024 + 65537)),
      )
    ).status,
  ).toBe(502);
  const fetcher = vi.fn(async () => Response.json({}));
  expect(
    (
      await syncGatewayResponse(
        request("/auth/v1/token", {
          method: "POST",
          body: "a".repeat(4 * 1024 * 1024 + 65537),
        }),
        env,
        fetcher,
      )
    ).status,
  ).toBe(413);
  expect(fetcher).not.toHaveBeenCalled();
  const failed = await syncGatewayResponse(req(), env, async () => {
    throw Error("private-upstream-information");
  });
  expect(failed.status).toBe(502);
  expect(await failed.text()).not.toContain("private-upstream");
});

test("relay aborts an unresponsive upstream before the native and platform deadlines", async () => {
  vi.useFakeTimers();
  try {
    const pending = syncGatewayResponse(
      request("/auth/v1/settings"),
      env,
      async (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init.signal!.addEventListener(
            "abort",
            () => reject(Error("timeout")),
            { once: true },
          ),
        ),
    );
    await vi.advanceTimersByTimeAsync(40000);
    expect((await pending).status).toBe(502);
  } finally {
    vi.useRealTimers();
  }
});
