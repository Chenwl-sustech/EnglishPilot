import { expect, test, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  readOfflineIdentity,
  sessionStorageKey,
  forgetStoredSession,
} from "../src/lib/sync/session-storage";
import { accountAccess } from "../src/lib/sync/access";

test("an expired but retained refresh session can open only its own local space offline", async () => {
  vi.useFakeTimers();
  try {
    const owner = "11111111-1111-4111-8111-111111111111";
    const key = sessionStorageKey("https://test.supabase.co");
    const values = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: async (key: string) => {
        values.delete(key);
      },
    };
    const expired = {
      access_token: "expired-test-access",
      refresh_token: "retained-test-refresh",
      expires_at: 1,
      expires_in: 3600,
      token_type: "bearer",
      user: {
        id: owner,
        aud: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-10-26T00:00:00Z",
      },
    };
    values.set(key, JSON.stringify(expired));
    const client = createClient(
      "https://test.supabase.co",
      "sb_publishable_test_public_key_1234",
      {
        auth: {
          storageKey: key,
          storage,
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: async () =>
            Response.json({ message: "offline" }, { status: 503 }),
        },
      },
    );
    const pending = client.auth.getSession();
    await vi.advanceTimersByTimeAsync(40000);
    const result = await pending;
    expect(result.data.session).toBeNull();
    expect(values.has(key)).toBe(true);
    const identity = await readOfflineIdentity(storage, key);
    expect(identity?.id).toBe(owner);
    expect(
      accountAccess(
        { uid: owner, project: "https://test.supabase.co" },
        true,
        null,
        "https://test.supabase.co",
        identity?.id,
      ),
    ).toBe("open");
    expect(
      accountAccess(
        { uid: "another-user", project: "https://test.supabase.co" },
        true,
        null,
        "https://test.supabase.co",
        identity?.id,
      ),
    ).toBe("login");
    await storage.removeItem(key);
    expect(await readOfflineIdentity(storage, key)).toBeNull();
    expect(
      accountAccess(
        { uid: owner, project: "https://test.supabase.co" },
        true,
        null,
        "https://test.supabase.co",
      ),
    ).toBe("login");
  } finally {
    vi.useRealTimers();
  }
}, 20000);

test("offline logout removes this project's credentials and preserves other projects", async () => {
  const key = sessionStorageKey("https://test.supabase.co"),
    values = new Map([
      [key, "session"],
      [key + "-user", "user"],
      [key + "-code-verifier", "proof"],
      ["englishpilot-auth-other", "other-session"],
    ]);
  await forgetStoredSession(
    {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => {
        values.set(k, v);
      },
      removeItem: (k) => {
        values.delete(k);
      },
    },
    key,
  );
  expect([...values.entries()]).toEqual([
    ["englishpilot-auth-other", "other-session"],
  ]);
});
