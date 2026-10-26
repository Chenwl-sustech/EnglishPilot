import { expect, test } from "vitest";
import { parseSyncConfig } from "../src/lib/sync/config";
import { createSessionStorage } from "../src/lib/sync/session-storage";
import { createClient } from "@supabase/supabase-js";
import { supabaseCloud } from "../src/lib/sync/client";
import { makeDocument } from "../src/lib/sync/document";
import { defaultState } from "../src/lib/engine";
test("only Supabase HTTPS origins and public keys can configure account upload", () => {
  const key = "sb_publishable_public_example_123456789";
  expect(parseSyncConfig({ url: "https://test.supabase.co/", key }).url).toBe(
    "https://test.supabase.co",
  );
  for (const url of [
    "http://test.supabase.co",
    "https://test.supabase.co.evil.test",
    "https://x:test@test.supabase.co",
    "https://test.supabase.co/path",
  ])
    expect(() => parseSyncConfig({ url, key })).toThrow();
  const jwt = (role: string) =>
    `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role }))}.signature`;
  expect(() =>
    parseSyncConfig({
      url: "https://test.supabase.co",
      key: jwt("service_role"),
    }),
  ).toThrow(/公开/);
  expect(() =>
    parseSyncConfig({
      url: "https://test.supabase.co",
      key: "sb_secret_abcdef123456789",
    }),
  ).toThrow(/公开/);
  expect(
    parseSyncConfig({ url: "https://test.supabase.co", key: jwt("anon") }).key,
  ).toBe(jwt("anon"));
});
test("cloud transport sends only own head query and CAS document, rejecting invalid server revisions", async () => {
  const requests: { url: URL; init?: RequestInit }[] = [];
  const doc = (
    await makeDocument({
      state: defaultState("2026-10-26"),
      recordings: [],
      listeningAudio: [],
    })
  ).document;
  const owner = "11111111-1111-4111-8111-111111111111";
  let revision: number | null = 1;
  const client = createClient(
    "https://test.supabase.co",
    "sb_publishable_test_public_key_1234",
    {
      accessToken: async () => "test-token",
      global: {
        fetch: async (input, init) => {
          const url = new URL(String(input));
          requests.push({ url, init });
          if (url.pathname === "/rest/v1/englishpilot_sync_heads")
            return Response.json({ revision: 1, document: doc });
          return Response.json(revision);
        },
      },
    },
  );
  const cloud = supabaseCloud(client, "https://test.supabase.co", owner);
  expect((await cloud.readHead())?.document.state.profile.name).toBe("学习者");
  expect(requests[0].url.searchParams.get("user_id")).toBe(`eq.${owner}`);
  expect(await cloud.commit(0, doc)).toBe(1);
  expect(JSON.parse(requests[1].init?.body as string)).toEqual({
    expected_revision: 0,
    p_document: doc,
  });
  revision = null;
  expect(await cloud.commit(1, doc)).toBeNull();
  revision = 100;
  await expect(cloud.commit(1, doc)).rejects.toThrow(/版本/);
  await expect(cloud.getChunk("../other-user/token")).rejects.toThrow(/路径/);
});
test("native session secrets use secure storage and never silently fall back", async () => {
  const values = new Map<string, string>();
  const storage = createSessionStorage({
    get: async ({ key }) => ({ value: values.get(key) ?? null }),
    set: async ({ key, value }) => {
      values.set(key, value);
    },
    remove: async ({ key }) => {
      values.delete(key);
    },
  });
  await storage.setItem("englishpilot-auth-test", "secret-session");
  expect(await storage.getItem("englishpilot-auth-test")).toBe(
    "secret-session",
  );
  await storage.removeItem("englishpilot-auth-test");
  expect(await storage.getItem("englishpilot-auth-test")).toBeNull();
  const unavailable = createSessionStorage({
    get: async () => {
      throw new Error("locked");
    },
    set: async () => {
      throw new Error("locked");
    },
    remove: async () => {
      throw new Error("locked");
    },
  });
  await expect(
    unavailable.setItem("englishpilot-auth-test", "secret"),
  ).rejects.toThrow("locked");
});
