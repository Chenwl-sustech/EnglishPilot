import { expect, test } from "vitest";
import { createPasswordRecovery } from "../src/lib/sync/password-recovery";

function fixture(
  store = new Map<string, string>(),
  recoverReply = () => Response.json({}),
) {
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "learner@example.com",
    aud: "authenticated",
    role: "authenticated",
    created_at: "2026-10-27T00:00:00Z",
    app_metadata: {},
    user_metadata: {},
  };
  const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }))}.syntheticSignature`;
  const calls: { url: URL; body: Record<string, unknown>; method: string }[] =
    [];
  let beforeExchange = () => {};
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)),
      method = init?.method ?? "GET",
      body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ url, body, method });
    if (url.pathname.endsWith("/recover")) return recoverReply();
    if (url.pathname.endsWith("/token")) {
      beforeExchange();
      expect(url.searchParams.get("grant_type")).toBe("pkce");
      expect(body.auth_code).toBe("synthetic-code");
      expect(typeof body.code_verifier).toBe("string");
      expect(String(body.code_verifier).length).toBeGreaterThan(40);
      return Response.json({
        access_token: token,
        refresh_token: "synthetic-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user,
      });
    }
    if (url.pathname.endsWith("/user")) return Response.json(user);
    if (url.pathname.endsWith("/logout")) return Response.json({});
    throw Error("Unexpected recovery request");
  };
  let now = Date.now();
  const flow = createPasswordRecovery(
    { url: "https://test.supabase.co", key: "sb_publishable_test123456789" },
    storage,
    fetcher,
    () => now,
  );
  return {
    flow,
    store,
    storage,
    calls,
    setBeforeExchange: (fn: () => void) => {
      beforeExchange = fn;
    },
    advance: (milliseconds = 600001) => {
      now += milliseconds;
    },
  };
}
const callback = "https://app.example.com/reset-password/?code=synthetic-code";

test("password update requires a verified recovery and matching confirmation", async () => {
  const f = fixture();
  await expect(
    f.flow.finish("new-private-password", "new-private-password"),
  ).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  await f.flow.request(" learner@example.com ", "https://app.example.com");
  const sent = f.calls.find((c) => c.url.pathname.endsWith("/recover"))!;
  expect(sent.body.email).toBe("learner@example.com");
  expect(sent.body.code_challenge_method).toBe("s256");
  expect(String(sent.body.code_challenge).length).toBeGreaterThan(40);
  expect(sent.url.searchParams.get("redirect_to")).toBe(
    "https://app.example.com/reset-password/",
  );
  let cleared = false;
  f.setBeforeExchange(() => expect(cleared).toBe(true));
  expect(
    await f.flow.consume(callback, () => {
      cleared = true;
    }),
  ).toBe("learner@example.com");
  await expect(
    f.flow.finish("new-private-password", "different"),
  ).rejects.toThrow();
  await expect(f.flow.finish("short", "short")).rejects.toThrow();
  expect(f.calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  await f.flow.finish("new-private-password", "new-private-password");
  expect(f.calls.find((c) => c.method === "PUT")?.body.password).toBe(
    "new-private-password",
  );
  await expect(
    f.flow.finish("another-password", "another-password"),
  ).rejects.toThrow();
  for (const [key, value] of f.store) {
    expect(key).toMatch(/-code-verifier$/);
    expect(value).not.toContain("synthetic-refresh");
    expect(value).not.toContain("new-private-password");
  }
});

test("only PKCE verifiers persist across tabs, never the recovery bearer session", async () => {
  const f = fixture();
  await f.flow.request("learner@example.com", "https://app.example.com");
  expect(f.store.size).toBeGreaterThan(0);
  const next = fixture(f.store);
  await expect(next.flow.consume(callback, () => {})).resolves.toBe(
    "learner@example.com",
  );
  for (const value of next.store.values())
    expect(value).not.toContain("synthetic-refresh");
  const reloaded = fixture(f.store);
  await expect(
    reloaded.flow.finish("another-password", "another-password"),
  ).rejects.toThrow();
});

test("wrong-browser callbacks fail before token exchange and clear the URL", async () => {
  const f = fixture();
  let cleared = false;
  await expect(
    f.flow.consume(callback, () => {
      cleared = true;
    }),
  ).rejects.toThrow();
  expect(cleared).toBe(true);
  expect(f.calls.filter((c) => c.url.pathname.endsWith("/token"))).toHaveLength(
    0,
  );
});

test("non-recovery exchanges and URL bearer tokens never authorize password changes", async () => {
  const f = fixture();
  await f.flow.request("learner@example.com", "https://app.example.com");
  for (const [key, value] of f.store)
    f.store.set(key, value.replace("/recovery", ""));
  await expect(f.flow.consume(callback, () => {})).rejects.toThrow();
  await expect(
    f.flow.finish("new-private-password", "new-private-password"),
  ).rejects.toThrow();
  let cleaned = false;
  await expect(
    f.flow.consume(
      "https://app.example.com/reset-password/#access_token=synthetic",
      () => {
        cleaned = true;
      },
    ),
  ).rejects.toThrow();
  expect(cleaned).toBe(true);
  expect(f.calls.filter((c) => c.method === "PUT")).toHaveLength(0);
});

test("verified recovery grants expire without changing the password", async () => {
  const f = fixture();
  await f.flow.request("learner@example.com", "https://app.example.com");
  await f.flow.consume(callback, () => {});
  f.advance();
  await expect(
    f.flow.finish("new-private-password", "new-private-password"),
  ).rejects.toThrow();
  expect(f.calls.filter((c) => c.method === "PUT")).toHaveLength(0);
});

test("mail rate limits explain the failure and stop repeated requests for a minute", async () => {
  const f = fixture(new Map(), () =>
    Response.json(
      { code: "over_email_send_rate_limit", msg: "private upstream detail" },
      { status: 429, headers: { "x-supabase-api-version": "2024-01-01" } },
    ),
  );
  await expect(
    f.flow.request("learner@example.com", "https://app.example.com"),
  ).rejects.toThrow(/邮件发送.*频率上限/);
  expect(f.flow.retryAfterSeconds()).toBe(60);
  await expect(
    f.flow.request("learner@example.com", "https://app.example.com"),
  ).rejects.toThrow(/等待/);
  expect(
    f.calls.filter((c) => c.url.pathname.endsWith("/recover")),
  ).toHaveLength(1);
  f.advance(60000);
  expect(f.flow.retryAfterSeconds()).toBe(0);
  await expect(
    f.flow.request("learner@example.com", "https://app.example.com"),
  ).rejects.toThrow(/邮件发送.*频率上限/);
  expect(
    f.calls.filter((c) => c.url.pathname.endsWith("/recover")),
  ).toHaveLength(2);
  await expect(
    f.flow.finish("new-private-password", "new-private-password"),
  ).rejects.toThrow();
  expect(f.calls.filter((c) => c.method === "PUT")).toHaveLength(0);
});

test("successful mail requests also enforce an interval without claiming delivery", async () => {
  const f = fixture();
  await f.flow.request("learner@example.com", "https://app.example.com");
  expect(f.flow.retryAfterSeconds()).toBe(60);
  f.advance(1001);
  expect(f.flow.retryAfterSeconds()).toBe(59);
  await expect(
    f.flow.request("learner@example.com", "https://app.example.com"),
  ).rejects.toThrow(/等待/);
  expect(
    f.calls.filter((c) => c.url.pathname.endsWith("/recover")),
  ).toHaveLength(1);
});

test.each([
  [403, "email_address_not_authorized", /项目成员邮箱/],
  [429, "over_request_rate_limit", /请求过于频繁/],
  [400, "unexpected_failure", /重设邮件请求失败/],
])(
  "mail errors use safe guidance for HTTP %s / %s",
  async (status, code, message) => {
    const f = fixture(new Map(), () =>
      Response.json(
        { code, msg: "private upstream detail" },
        {
          status,
          headers: { "x-supabase-api-version": "2024-01-01" },
        },
      ),
    );
    let caught: unknown;
    try {
      await f.flow.request("learner@example.com", "https://app.example.com");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(message);
    expect((caught as Error).message).not.toContain("private upstream detail");
  },
);
