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
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { isAllowedSourcePath } from "./package-mobile.mjs";

const require = createRequire(import.meta.url);
const config = `export default { output: "export", trailingSlash: true, poweredByHeader: false, images: { unoptimized: true } };\n`;

export async function stageNativeApp(root, destination) {
  root = resolve(root);
  destination = resolve(destination);
  if (destination === root) throw Error("不能覆盖原有项目");
  await mkdir(destination, { recursive: false });
  const files = [];
  async function copy(path) {
    const info = await lstat(join(root, path));
    if (info.isSymbolicLink()) throw Error(`禁止打包符号链接：${path}`);
    if (info.isDirectory()) {
      if (
        path
          .split("/")
          .some(
            (part) =>
              part.startsWith(".") ||
              [
                "node_modules",
                "recordings",
                "models",
                "backups",
                "tests",
              ].includes(part),
          )
      )
        return;
      if (path === "src/app/api") return;
      for (const name of (await readdir(join(root, path))).sort())
        await copy(`${path}/${name}`);
      return;
    }
    if (
      !isAllowedSourcePath(path) ||
      ["src/proxy.ts", "public/sw.js"].includes(path)
    )
      return;
    await mkdir(join(destination, path, ".."), { recursive: true });
    if (path === "src/app/manifest.ts") {
      await writeFile(
        join(destination, path),
        'export const dynamic = "force-static";\n' +
          (await readFile(join(root, path), "utf8")),
      );
    } else
      await cp(join(root, path), join(destination, path), {
        errorOnExist: true,
      });
    files.push(path);
  }
  for (const path of [
    "src",
    "public",
    "package.json",
    "tsconfig.json",
    "next-env.d.ts",
  ])
    await copy(path);
  await writeFile(join(destination, "next.config.mjs"), config);
  await writeFile(
    join(destination, ".gitignore"),
    ".next/\nnode_modules/\nout/\n",
  );
  return { directory: destination, files };
}

function run(command, args, options) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { ...options, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? done() : reject(Error(`移动端构建失败 (${code})`)),
    );
  });
}

export async function buildNativeApp(root = process.cwd()) {
  root = resolve(root);
  const local = join(root, ".local");
  await mkdir(local, { recursive: true });
  const workspace = await mkdtemp(join(local, "native-build-"));
  const stage = join(workspace, "app");
  const result = await stageNativeApp(root, stage);
  await symlink(
    join(root, "node_modules"),
    join(stage, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await run(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "build", "--webpack"],
    {
      cwd: stage,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        ENGLISHPILOT_PACKAGE: "0",
        NEXT_PUBLIC_ENGLISHPILOT_NATIVE: "1",
        NEXT_PUBLIC_ENGLISHPILOT_WEB: "1",
      },
    },
  );
  const target = join(local, "native-web");
  const existing = await lstat(target).catch((e) => {
    if (e.code !== "ENOENT") throw e;
    return null;
  });
  if (existing) {
    if (
      existing.isSymbolicLink() ||
      resolve(target) !== join(root, ".local", "native-web") ||
      !resolve(target).startsWith(root + sep)
    )
      throw Error("不安全的移动资源目标");
    if (
      (await readFile(join(target, ".englishpilot-generated"), "utf8")) !==
      "native-web-v1\n"
    )
      throw Error("拒绝覆盖未识别的资源目录");
    await rm(target, { recursive: true });
  }
  await mkdir(target);
  await writeFile(join(target, ".englishpilot-generated"), "native-web-v1\n");
  await cp(join(stage, "out"), join(target, "out"), { recursive: true });
  await writeFile(
    join(target, "source-inventory.json"),
    JSON.stringify({ version: 1, files: result.files }, null, 2),
  );
  process.stdout.write(
    `内置学习资源已生成：${join(target, "out")}\n未生成 IPA 或已签名 HAP。\n`,
  );
  return { ...result, output: join(target, "out") };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  buildNativeApp().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
