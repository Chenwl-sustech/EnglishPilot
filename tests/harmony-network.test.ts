import { expect, test } from "vitest";
import {
  harmonyRequestAllowed,
  harmonyHeaders,
} from "../src/lib/native/harmony-policy";
import { createHarmonyFetch } from "../src/lib/native/harmony-http";

test("Harmony network allows only account endpoints and owned content address shapes", () => {
  expect(
    harmonyRequestAllowed(
      "https://test.supabase.co/auth/v1/token?grant_type=password",
      "POST",
    ),
  ).toBe(true);
  expect(
    harmonyRequestAllowed(
      "https://test.supabase.co/rest/v1/englishpilot_sync_heads?select=revision%2Cdocument",
      "GET",
    ),
  ).toBe(true);
  expect(
    harmonyRequestAllowed(
      "https://test.supabase.co/rest/v1/rpc/englishpilot_sync_commit",
      "POST",
    ),
  ).toBe(true);
  const audio =
    "https://test.supabase.co/storage/v1/object/englishpilot-sync/11111111-1111-4111-8111-111111111111/chunks/" +
    "a".repeat(64);
  expect(harmonyRequestAllowed(audio, "POST")).toBe(true);
  expect(harmonyRequestAllowed(audio, "GET")).toBe(true);
  expect(
    harmonyRequestAllowed(
      "https://englishpilot-chenwl-sync.netlify.app/api/teacher",
      "POST",
    ),
  ).toBe(true);
  for (const url of [
    "http://test.supabase.co/auth/v1/token",
    "https://test.supabase.co.evil.test/auth/v1/token",
    "https://test.supabase.co@evil.test/auth/v1/token",
    "https://test.supabase.co:443/auth/v1/token",
    "https://test.supabase.co/auth/v1/../admin/users",
    "https://test.supabase.co/auth/v1/%2e%2e/admin/users",
    "https://test.supabase.co/auth/v1/admin/users",
    "https://test.supabase.co/rest/v1/unrelated_table",
    "https://127.0.0.1/auth/v1/token",
    "https://englishpilot-chenwl-sync.netlify.app/api/whisper",
    audio + "/../private",
    audio + "#fragment",
  ]) {
    expect(harmonyRequestAllowed(url, "POST"), url).toBe(false);
  }
  expect(harmonyRequestAllowed(audio, "DELETE")).toBe(false);
  expect(
    harmonyRequestAllowed(
      "https://test.supabase.co/rest/v1/englishpilot_sync_heads",
      "POST",
    ),
  ).toBe(false);
});

test("Harmony native headers cannot inject hosts, cookies or header lines", () => {
  expect(
    harmonyHeaders({
      Authorization: "Bearer test",
      "Content-Type": "application/json",
      Prefer: "return=representation",
    }),
  ).toEqual({
    authorization: "Bearer test",
    "content-type": "application/json",
    prefer: "return=representation",
  });
  const invalid: Record<string, string>[] = [
    { Host: "evil.test" },
    { Cookie: "private=1" },
    { Authorization: "token\r\nX-Other: evil" },
    { apikey: "x".repeat(9000) },
  ];
  for (const headers of invalid)
    expect(() => harmonyHeaders(headers)).toThrow();
});

test("Harmony fetch preserves multipart upload bytes and binary audio responses", async () => {
  let sent: any;
  const fetcher = createHarmonyFetch({
    call: async (method, args) => {
      expect(method).toBe("http");
      sent = JSON.parse(args[0] as string);
      return JSON.stringify({
        status: 200,
        headers: { "content-type": "application/octet-stream" },
        bodyBase64: "AP+AQUI=",
      });
    },
  });
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array([0, 255, 128, 65, 66])]),
    "tone.wav",
  );
  const url =
    "https://test.supabase.co/storage/v1/object/englishpilot-sync/11111111-1111-4111-8111-111111111111/chunks/" +
    "b".repeat(64);
  const response = await fetcher(url, {
    method: "POST",
    body: form,
    headers: { Authorization: "Bearer synthetic-token" },
  });
  expect(sent.headers["content-type"]).toContain(
    "multipart/form-data; boundary=",
  );
  expect(atob(sent.bodyBase64)).toContain("tone.wav");
  expect(atob(sent.bodyBase64)).toContain(
    String.fromCharCode(0, 255, 128, 65, 66),
  );
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(
    new Uint8Array([0, 255, 128, 65, 66]),
  );
  expect(response.headers.get("content-type")).toBe("application/octet-stream");
});

test("Harmony fetch rejects redirects, oversize bodies, malformed replies and pre-aborted requests", async () => {
  let calls = 0;
  const fetcher = createHarmonyFetch({
    call: async () => {
      calls++;
      return JSON.stringify({ status: 302, headers: {}, bodyBase64: "" });
    },
  });
  await expect(
    fetcher("https://englishpilot-chenwl-sync.netlify.app/api/teacher"),
  ).rejects.toThrow(/重定向/);
  await expect(
    fetcher("https://test.supabase.co/auth/v1/token", {
      method: "POST",
      body: "x".repeat(5 * 1024 * 1024 + 1),
    }),
  ).rejects.toThrow(/上限/);
  const controller = new AbortController();
  controller.abort();
  await expect(
    fetcher("https://test.supabase.co/auth/v1/token", {
      signal: controller.signal,
    }),
  ).rejects.toThrow();
  expect(calls).toBe(1);
  const invalid = createHarmonyFetch({
    call: async () =>
      JSON.stringify({ status: 200, headers: {}, bodyBase64: "%%%=" }),
  });
  await expect(
    invalid("https://test.supabase.co/auth/v1/token", { method: "POST" }),
  ).rejects.toThrow(/无效/);
});
