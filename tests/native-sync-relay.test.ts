import { test, expect } from "vitest";
import { createSyncRelayFetch } from "../src/lib/native/sync-relay";

test("iPad and Harmony share relay mapping without changing original account identity or JSON bodies", async () => {
  let sent: Request | undefined;
  const f = createSyncRelayFetch(
    async (input, init) => {
      sent = new Request(input, init);
      return Response.json({ ok: true });
    },
    {
      origin: "https://englishpilot-chenwl-sync.netlify.app",
      project: "https://test.supabase.co",
    },
  );
  await f("https://test.supabase.co/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: "public-fixture", "content-type": "application/json" },
    body: '{"password":"synthetic"}',
  });
  expect(sent!.url).toBe(
    "https://englishpilot-chenwl-sync.netlify.app/api/sync/test/auth/v1/token?grant_type=password",
  );
  expect(await sent!.text()).toBe('{"password":"synthetic"}');
  await f("https://other.supabase.co/auth/v1/settings");
  expect(sent!.url).toBe("https://other.supabase.co/auth/v1/settings");
});
