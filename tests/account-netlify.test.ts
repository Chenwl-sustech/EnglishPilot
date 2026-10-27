import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  rm,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, vi } from "vitest";
import { assembleAccountNetlify } from "../scripts/build-account-netlify.mjs";

const runtime = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_public_123456789",
  ENGLISHPILOT_ALLOWED_USERS: "11111111-1111-4111-8111-111111111111",
  AI_BACKEND_ORIGIN: "https://fixture.vercel.app",
  AI_BACKEND_TOKEN: "private-fixture-backend-token-123456789",
};

test("Netlify assembly publishes static assets separately and preserves its own CLI metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "pilot-netlify-")),
    source = join(root, "export"),
    target = join(root, "deploy");
  try {
    await mkdir(source);
    await writeFile(join(source, "index.html"), "<h1>Learning</h1>");
    await writeFile(join(root, ".env.local"), "PRIVATE=fixture");
    await assembleAccountNetlify(source, target);
    expect(await readFile(join(target, "public/index.html"), "utf8")).toBe(
      "<h1>Learning</h1>",
    );
    expect(await readdir(join(target, "public"))).toEqual(["index.html"]);
    await expect(readFile(join(target, ".env.local"))).rejects.toThrow();
    await expect(
      readFile(join(target, "public/server/proxy.mjs")),
    ).rejects.toThrow();
    const entry = await import(
      pathToFileURL(join(target, "functions/ai.mjs")).href
    );
    expect(entry.config.path).toEqual([
      "/api/evaluate",
      "/api/teacher",
      "/api/configuration",
      "/api/ai-usage",
    ]);
    for (const [name, value] of Object.entries(runtime))
      vi.stubEnv(name, value);
    for (const api of entry.config.path) {
      const response = await entry.default(
        new Request("https://site.netlify.app" + api, {
          method: api === "/api/teacher" ? "POST" : "GET",
        }),
      );
      expect(response.status).toBe(401);
      expect((await response.json()).error).toContain("登录");
    }
    expect(
      (
        await entry.default(
          new Request("https://site.netlify.app/api/bootstrap"),
        )
      ).status,
    ).toBe(404);
    await mkdir(join(target, ".netlify"));
    await writeFile(
      join(target, ".netlify/state.json"),
      '{"siteId":"fixture"}',
    );
    await assembleAccountNetlify(source, target);
    expect(await readFile(join(target, ".netlify/state.json"), "utf8")).toBe(
      '{"siteId":"fixture"}',
    );
    await expect(assembleAccountNetlify(source, root)).rejects.toThrow();
    await symlink(join(source, "index.html"), join(source, "escape.html"));
    await expect(assembleAccountNetlify(source, target)).rejects.toThrow();
  } finally {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});

test("Netlify gateway keeps original URLs and stops hanging network work before platform timeout", async () => {
  const entry = await import("../web-cloud/netlify-functions/ai.mjs");
  for (const [name, value] of Object.entries(runtime)) vi.stubEnv(name, value);
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (input: string) => {
    urls.push(input);
    return input.includes("/auth/v1/user")
      ? Response.json({
          id: runtime.ENGLISHPILOT_ALLOWED_USERS,
          is_anonymous: false,
        })
      : Response.json({ ok: true });
  });
  const request = () =>
    new Request("https://site.netlify.app/api/evaluate", {
      headers: { Authorization: "Bearer synthetic-session" },
    });
  try {
    expect((await entry.default(request())).status).toBe(200);
    expect(urls.at(-1)).toBe("https://fixture.vercel.app/api/evaluate");
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      (_input: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener(
            "abort",
            () => reject(Error("synthetic timeout")),
            { once: true },
          );
        }),
    );
    const response = entry.default(request());
    await vi.advanceTimersByTimeAsync(55000);
    const failed = await response;
    expect(failed.status).toBe(502);
    expect(failed.headers.get("content-type")).toContain("application/json");
    expect((await failed.json()).error).toContain("连接失败或超时");
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

test("a symlink ancestor cannot disguise source overlap and delete the static export", async () => {
  const root = await mkdtemp(join(tmpdir(), "pilot-netlify-alias-")),
    source = join(root, "export"),
    target = join(root, "deploy"),
    alias = join(root, "alias");
  try {
    await mkdir(source);
    await writeFile(join(source, "index.html"), "preserve-this-export");
    await assembleAccountNetlify(source, target);
    await symlink(target, alias, "dir");
    await expect(
      assembleAccountNetlify(join(alias, "public"), target),
    ).rejects.toThrow();
    expect(await readFile(join(target, "public/index.html"), "utf8")).toBe(
      "preserve-this-export",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
