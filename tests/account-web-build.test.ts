import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  webBuildEnvironment,
  assembleAccountWeb,
} from "../scripts/build-account-web.mjs";
test("static build receives public configuration while private service credentials stay out", () => {
  const env = webBuildEnvironment({
    PATH: "/bin",
    HOME: "/home/test",
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test123456789",
    AI_BACKEND_TOKEN: "private",
    OPENAI_API_KEY: "private",
    NEXT_PUBLIC_AI_SECRET: "private",
    NEXT_PUBLIC_ENGLISHPILOT_NATIVE: "1",
  });
  expect(env.AI_BACKEND_TOKEN).toBeUndefined();
  expect(env.OPENAI_API_KEY).toBeUndefined();
  expect(env.NEXT_PUBLIC_AI_SECRET).toBeUndefined();
  expect(env.NEXT_PUBLIC_ENGLISHPILOT_NATIVE).toBe("0");
  expect(env.NEXT_PUBLIC_ENGLISHPILOT_ACCOUNT_WEB).toBe("1");
  expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://test.supabase.co");
});
test("deployment separates static assets from authenticated server code and refuses unsafe inputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "account-web-test-")),
    source = join(root, "out"),
    destination = join(root, "deploy");
  try {
    await mkdir(source);
    await writeFile(join(source, "index.html"), "<h1>App</h1>");
    await assembleAccountWeb(source, destination);
    expect(await readFile(join(destination, "public/index.html"), "utf8")).toBe(
      "<h1>App</h1>",
    );
    expect(
      (await readFile(join(destination, "api/index.js"), "utf8")).length,
    ).toBeGreaterThan(0);
    await expect(
      readFile(join(destination, "public/api/index.js")),
    ).rejects.toThrow();
    await expect(readFile(join(destination, ".env.example"))).rejects.toThrow();
    await symlink(join(source, "index.html"), join(source, "link.html"));
    await expect(assembleAccountWeb(source, destination)).rejects.toThrow(
      /符号链接/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
