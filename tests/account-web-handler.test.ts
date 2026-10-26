import { expect, test, vi } from "vitest";
import handler from "../web-cloud/api/index.js";
test("Vercel adapter preserves the original API path and caps auto-parsed JSON bodies", async () => {
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_public_123456789",
    ENGLISHPILOT_ALLOWED_USERS: "11111111-1111-4111-8111-111111111111",
    AI_BACKEND_ORIGIN: "https://fixture.vercel.app",
    AI_BACKEND_TOKEN: "private-fixture-backend-token-123456789",
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (input: string) => {
    urls.push(input);
    return input.includes("/auth/v1/user")
      ? Response.json({
          id: env.ENGLISHPILOT_ALLOWED_USERS,
          is_anonymous: false,
        })
      : Response.json({ reply: "okay" });
  });
  const response = () => ({
    statusCode: 0,
    headers: new Map<string, string>(),
    output: "",
    setHeader(name: string, value: string) {
      this.headers.set(name, value);
    },
    end(value: Buffer | string) {
      this.output = value.toString();
    },
  });
  try {
    const res = response();
    await handler(
      {
        method: "POST",
        url: "/api/teacher",
        headers: {
          authorization: "Bearer user-session",
          "content-type": "application/json",
        },
        body: { text: "hi" },
      },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.output)).toEqual({ reply: "okay" });
    expect(urls).toEqual([
      "https://test.supabase.co/auth/v1/user",
      "https://fixture.vercel.app/api/teacher",
    ]);
    const tooLarge = response();
    await handler(
      {
        method: "POST",
        url: "/api/teacher",
        headers: {
          authorization: "Bearer user-session",
          "content-type": "application/json",
        },
        body: { text: "x".repeat(200001) },
      },
      tooLarge,
    );
    expect(tooLarge.statusCode).toBe(413);
    expect(urls).toHaveLength(2);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
