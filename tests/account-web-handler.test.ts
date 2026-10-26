import { expect, test, vi } from "vitest";
import evaluate from "../web-cloud/api/evaluate.js";
import teacher from "../web-cloud/api/teacher.js";
import configuration from "../web-cloud/api/configuration.js";
import usage from "../web-cloud/api/ai-usage.js";
test("each Vercel fetch entry retains its real API URL and bounds raw request bodies", async () => {
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
      : Response.json({ okay: true });
  });
  const request = (path: string, text = "hi") =>
    new Request("https://app.test" + path, {
      method: "POST",
      headers: {
        Authorization: "Bearer user-session",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
  try {
    for (const [entry, path] of [
      [evaluate, "/api/evaluate"],
      [teacher, "/api/teacher"],
      [configuration, "/api/configuration"],
      [usage, "/api/ai-usage"],
    ] as const) {
      expect((await entry.fetch(request(path))).status).toBe(200);
      expect(urls.at(-1)).toBe("https://fixture.vercel.app" + path);
    }
    const count = urls.length;
    expect(
      (await teacher.fetch(request("/api/teacher", "x".repeat(200001)))).status,
    ).toBe(413);
    expect(
      (await evaluate.fetch(new Request("https://app.test/api/evaluate")))
        .status,
    ).toBe(401);
    expect(urls).toHaveLength(count);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
