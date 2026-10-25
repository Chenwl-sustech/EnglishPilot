import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cp, lstat, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { writeResourceManifest } from "./native-resources.mjs";

const root = resolve(".");
const source = join(root, ".local/native-web/out");
const manifest = await writeResourceManifest(source);
for (const route of [
  "/index.html",
  "/today/index.html",
  "/mini-test/index.html",
  "/settings/index.html",
])
  if (!manifest.resources[route]) throw Error(`内置页面缺失：${route}`);

const target = join(
  root,
  "native/harmony/entry/src/main/resources/rawfile/web",
);
// Verify every existing ancestor before a recursive removal; never follow links.
let current = root;
for (const part of "native/harmony/entry/src/main/resources/rawfile/web".split(
  "/",
)) {
  current = join(current, part);
  const info = await lstat(current).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (info?.isSymbolicLink()) throw Error("原生资源目录不得使用符号链接");
}
if (
  current !== target ||
  target !==
    resolve(root, "native/harmony/entry/src/main/resources/rawfile/web")
)
  throw Error("无效的鸿蒙资源路径");
const existing = await lstat(target).catch((error) => {
  if (error.code !== "ENOENT") throw error;
  return null;
});
if (existing) {
  const old = JSON.parse(
    await readFile(join(target, "native-resources.json"), "utf8"),
  );
  if (old.origin !== manifest.origin || old.version !== 1)
    throw Error("拒绝覆盖未识别的鸿蒙资源目录");
  await rm(target, { recursive: true });
}
await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true });
await cp(
  join(root, "src/lib/native/resource-path.ts"),
  join(root, "native/harmony/entry/src/main/ets/ResourcePath.ets"),
);
for (const directory of [
  "native/harmony/AppScope/resources/base/media",
  "native/harmony/entry/src/main/resources/base/media",
]) {
  await mkdir(join(root, directory), { recursive: true });
  await cp(
    join(root, "public/icon.svg"),
    join(root, directory, "app_icon.svg"),
  );
}
const require = createRequire(import.meta.url);
const cli = join(
  dirname(require.resolve("@capacitor/cli/package.json")),
  "bin/capacitor",
);
await new Promise((done, reject) => {
  const child = spawn(process.execPath, [cli, "sync", "ios"], {
    cwd: root,
    stdio: "inherit",
  });
  child.on("error", reject);
  child.on("exit", (code) =>
    code === 0 ? done() : reject(Error(`iOS 资源同步失败 (${code})`)),
  );
});
process.stdout.write(
  `两端已同步 ${Object.keys(manifest.resources).length} 个内置资源；平台编译和真机签名仍需单独执行。\n`,
);
