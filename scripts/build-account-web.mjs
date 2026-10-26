import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stageNativeApp } from "./build-native.mjs";
import { preparePwa } from "./prepare-pwa.mjs";
import { parsePublicSyncConfig } from "../src/lib/sync/public-config.mjs";
const require = createRequire(import.meta.url);
const template = fileURLToPath(new URL("../web-cloud/", import.meta.url));
/** @param {Record<string, string | undefined>} source @returns {Record<string, string>} */
export function webBuildEnvironment(source = process.env) {
  const config = parsePublicSyncConfig({
    url: source.NEXT_PUBLIC_SUPABASE_URL ?? "",
    key: source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  });
  const env = {};
  for (const key of [
    "PATH",
    "HOME",
    "TMPDIR",
    "TEMP",
    "SystemRoot",
    "LANG",
    "LC_ALL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ])
    if (source[key]) env[key] = source[key];
  return {
    ...env,
    NEXT_PUBLIC_SUPABASE_URL: config.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.key,
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_ENGLISHPILOT_NATIVE: "0",
    NEXT_PUBLIC_ENGLISHPILOT_WEB: "1",
    NEXT_PUBLIC_ENGLISHPILOT_ACCOUNT_WEB: "1",
    NEXT_PUBLIC_SYNC_SIGNUP: "0",
  };
}
async function noLinks(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw Error("部署内容不接受符号链接");
  if (info.isDirectory())
    for (const name of await readdir(path)) await noLinks(join(path, name));
}
export async function assembleAccountWeb(output, destination) {
  await noLinks(output);
  const old = await lstat(destination).catch((e) => {
    if (e.code !== "ENOENT") throw e;
    return null;
  });
  if (old) {
    if (
      old.isSymbolicLink() ||
      !old.isDirectory() ||
      (await readFile(
        join(destination, ".englishpilot-account-web"),
        "utf8",
      ).catch(() => "")) !== "account-web-v1\n"
    )
      throw Error("拒绝覆盖未识别的部署目录");
    for (const name of ["public", "api", "server"]) {
      const target = join(destination, name);
      if ((await lstat(target).catch(() => null))?.isSymbolicLink())
        throw Error("部署内容不接受符号链接");
      await rm(target, { recursive: true, force: true });
    }
  } else await mkdir(destination, { recursive: true });
  await writeFile(
    join(destination, ".englishpilot-account-web"),
    "account-web-v1\n",
  );
  await cp(output, join(destination, "public"), { recursive: true });
  for (const name of ["api", "server", "package.json", "vercel.json"])
    await cp(join(template, name), join(destination, name), {
      recursive: true,
    });
  return destination;
}
export async function buildAccountWeb(root = process.cwd()) {
  root = resolve(root);
  const local = join(root, ".local");
  await mkdir(local, { recursive: true });
  const workspace = await mkdtemp(join(local, "account-web-build-")),
    stage = join(workspace, "app");
  await stageNativeApp(root, stage);
  await cp(join(root, "public/sw.js"), join(stage, "public/sw.js"));
  await symlink(
    join(root, "node_modules"),
    join(stage, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [require.resolve("next/dist/bin/next"), "build", "--webpack"],
      { cwd: stage, env: webBuildEnvironment(), stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(Error(`账号网页版构建失败 (${code})`)),
    );
  });
  await preparePwa(stage);
  await cp(
    join(stage, "public/offline-assets.json"),
    join(stage, "out/offline-assets.json"),
  );
  const destination = await assembleAccountWeb(
    join(stage, "out"),
    join(local, "account-web-deploy"),
  );
  process.stdout.write(
    `账号网页版已构建：${destination}\n静态页面仅含公开配置；AI 网关凭据需在 Vercel 服务端单独配置。\n`,
  );
  return destination;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  buildAccountWeb().catch((error) => {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  });
