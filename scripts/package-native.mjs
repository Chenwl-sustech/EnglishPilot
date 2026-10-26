import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { isAllowedSourcePath } from "./package-mobile.mjs";
import {
  createResourceManifest,
  readResourceFiles,
  safeResourcePath,
} from "./native-resources.mjs";

const inventoryFile = "NATIVE-PROJECT-INVENTORY.json";
const exactFiles = new Set([
  ".gitignore",
  ".gitattributes",
  ".local/native-web/.englishpilot-generated",
  "package.json",
  "package-lock.json",
  "README.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "NOTICE.md",
  ".env.example",
  "backend/.env.example",
  "vitest.config.ts",
  "docs/installation.md",
  "docs/cloud-backend.md",
  "public/open-vocabulary-attribution.txt",
  "capacitor.config.json",
  "tsconfig.json",
  "next.config.ts",
  "next-env.d.ts",
  "scripts/build-native.mjs",
  "scripts/sync-native.mjs",
  "scripts/package-native.mjs",
  "scripts/native-resources.mjs",
  "scripts/native-doctor.mjs",
  "scripts/package-mobile.mjs",
  "scripts/next.mjs",
  "scripts/prepare-pwa.mjs",
  "native/ios/.gitignore",
  "native/harmony/.gitignore",
]);
const deniedPart =
  /^(?:\.env.*|\.git|\.local|\.hvigor|\.swiftpm|node_modules|oh_modules|build|output|dist|Pods|DerivedData|xcuserdata|signing|recordings|models|backups)$/i;
const nativeExtension =
  /\.(?:ts|ets|swift|pbxproj|plist|xcprivacy|xcconfig|storyboard|json5?|md|png|svg|html|txt|css|js|xml|ico|woff2?|webmanifest)$/;
const digest = (data) => createHash("sha256").update(data).digest("hex");

function allowed(path) {
  if (exactFiles.has(path)) return true;
  const nativePath = path.startsWith("native/");
  const safeNativePath = !/[\\:\x00-\x1f]/.test(path) && !path.startsWith("/") && path.split("/").every(part => part && part !== "." && part !== "..");
  if (!(nativePath ? safeNativePath : safeResourcePath(path))) return false;
  if (path.startsWith(".local/native-web/out/")) return false;
  if (path.split("/").some((part) => deniedPart.test(part))) return false;
  if (path.startsWith("src/") || path.startsWith("public/"))
    return isAllowedSourcePath(path);
  if (path.startsWith("LICENSES/") || path.startsWith("data-provenance/"))
    return /\.(?:txt|md|json)$/i.test(path);
  if (["scripts/", "tests/", "tests-release/", "backend/"].some(prefix => path.startsWith(prefix)))
    return /\.(?:ts|tsx|js|mjs|json|md|html)$/i.test(path);
  return (
    path.startsWith("native/") &&
    nativeExtension.test(path) &&
    !/(?:^|\/)local\.properties$/.test(path)
  );
}
export { allowed as isAllowedProjectSourcePath };

export function validateAssetCatalogReferences(entries) {
  for (const [path, bytes] of Object.entries(entries)) {
    if (!path.includes(".xcassets/") || !path.endsWith("/Contents.json")) continue;
    const directory = path.slice(0, path.lastIndexOf("/"));
    function visit(value) {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (key === "filename") {
          if (typeof child !== "string" || !child || /[\\/:\x00-\x1f]/.test(child) || child === "." || child === ".." || !entries[directory + "/" + child])
            throw Error(`Asset catalog 缺少或包含无效资源：${path}`);
        } else visit(child);
      }
    }
    visit(JSON.parse(strFromU8(bytes)));
  }
}

function allowedPayload(path) {
  const prefix = [".local/native-web/out/", "native/ios/App/App/public/", "native/harmony/entry/src/main/resources/rawfile/web/"].find((value) => path.startsWith(value));
  if (!prefix) return false;
  return (
    path.startsWith(prefix) &&
    safeResourcePath(path.slice(prefix.length)) &&
    /\.(?:html|js|css|txt|json|png|svg|ico|woff2?|webmanifest)$/.test(path)
  );
}

function checkContent(path, bytes) {
  if (
    !/\.(?:png|ico|woff2?)$/i.test(path) &&
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b|-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\b|["'](?:storePassword|keyPassword)["']\s*:\s*["'][^"']+["']/.test(
      strFromU8(bytes),
    )
  )
    throw Error(`发现疑似密钥或签名口令，拒绝打包：${path}`);
}

function verifyResources(expected, actual) {
  if (
    expected.version !== 1 ||
    expected.origin !== actual.origin ||
    !expected.resources ||
    Object.keys(expected.resources).length !==
      Object.keys(actual.resources).length
  )
    throw Error("内置资源清单校验失败");
  for (const [path, entry] of Object.entries(actual.resources)) {
    const old = expected.resources[path];
    if (
      !old ||
      ["file", "bytes", "mime", "sha256"].some((key) => old[key] !== entry[key])
    )
      throw Error(`内置资源校验失败：${path}`);
  }
  for (const path of [
    "/index.html",
    "/today/index.html",
    "/mini-test/index.html",
    "/settings/index.html",
  ])
    if (!actual.resources[path]) throw Error(`内置学习页面缺失：${path}`);
}

export async function buildNativeProjectArchive(root = process.cwd()) {
  root = resolve(root);
  const entries = Object.create(null);
  async function add(path) {
    let current = root;
    for (const part of path.split("/")) {
      current = join(current, part);
      if ((await lstat(current)).isSymbolicLink())
        throw Error(`禁止打包符号链接：${path}`);
    }
    const bytes = new Uint8Array(await readFile(join(root, path)));
    checkContent(path, bytes);
    entries[path] = bytes;
  }
  async function walk(path) {
    // These copies are regenerated from the verified payload below. Do not read
    // stale or stray files left inside a previously synchronized host directory.
    if (
      path === "native/ios/App/App/public" ||
      path === "native/harmony/entry/src/main/resources/rawfile/web"
    )
      return;
    const name = path.split("/").at(-1);
    if (deniedPart.test(name)) return;
    const info = await lstat(join(root, path));
    if (info.isSymbolicLink()) throw Error(`禁止打包符号链接：${path}`);
    if (info.isDirectory()) {
      for (const child of (await readdir(join(root, path))).sort())
        await walk(`${path}/${child}`);
    } else if (allowed(path)) await add(path);
  }
  for (const path of exactFiles) {
    if (
      await lstat(join(root, path)).catch((e) => {
        if (e.code !== "ENOENT") throw e;
        return null;
      })
    )
      await add(path);
  }
  for (const path of ["src", "public", "native", "scripts", "tests", "tests-release", "backend"]) await walk(path);
  // Include the complete notices alongside any bundled third-party code/data.
  async function addNotices(path) {
    const info = await lstat(join(root, path));
    if (info.isSymbolicLink()) throw Error(`禁止打包符号链接：${path}`);
    if (info.isDirectory()) for (const child of (await readdir(join(root, path))).sort()) await addNotices(`${path}/${child}`);
    else await add(path);
  }
  for (const path of ["LICENSES", "data-provenance"]) await addNotices(path);
  const output = join(root, ".local/native-web/out");
  if (
    (await readFile(
      join(root, ".local/native-web/.englishpilot-generated"),
      "utf8",
    )) !== "native-web-v1\n"
  )
    throw Error("移动资源所有权标记校验失败");
  const resources = await readResourceFiles(output);
  const expected = JSON.parse(
    await readFile(join(output, "native-resources.json"), "utf8"),
  );
  verifyResources(expected, createResourceManifest(resources));
  for (const { path } of resources) await add(`.local/native-web/out/${path}`);
  await add(".local/native-web/out/native-resources.json");
  for (const prefix of [
    "native/ios/App/App/public/",
    "native/harmony/entry/src/main/resources/rawfile/web/",
  ]) {
    for (const { path } of resources)
      entries[prefix + path] = entries[`.local/native-web/out/${path}`];
    entries[prefix + "native-resources.json"] =
      entries[".local/native-web/out/native-resources.json"];
  }
  const required = [
    "package.json",
    "package-lock.json",
    "capacitor.config.json",
    "scripts/sync-native.mjs",
    "native/ios/App/App.xcodeproj/project.pbxproj",
    "native/harmony/entry/src/main/ets/pages/Index.ets",
    "docs/installation.md",
    "LICENSE",
    "NOTICE.md",
  ];
  for (const path of required)
    if (!entries[path]) throw Error(`工程包缺少文件：${path}`);
  const inventory = {
    format: "EnglishPilotNativeProjects",
    version: 1,
    artifactType: "source-projects",
    date: "2026-10-25",
    platformCompilationVerified: { ios: false, harmony: false },
    signingVerified: false,
    files: Object.entries(entries)
      .map(([path, bytes]) => ({
        path,
        bytes: bytes.byteLength,
        sha256: digest(bytes),
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  };
  entries[inventoryFile] = strToU8(JSON.stringify(inventory, null, 2));
  const archive = zipSync(entries, {
    level: 9,
    mtime: new Date("2026-10-25T00:00:00Z"),
  });
  validateNativeProjectArchive(archive);
  return { archive, inventory };
}

export function validateNativeProjectArchive(archive) {
  const entries = unzipSync(archive);
  if (!entries[inventoryFile]) throw Error("工程包缺少清单");
  const inventory = JSON.parse(strFromU8(entries[inventoryFile]));
  if (
    inventory.format !== "EnglishPilotNativeProjects" ||
    inventory.version !== 1 ||
    inventory.artifactType !== "source-projects" ||
    !Array.isArray(inventory.files)
  )
    throw Error("工程清单无效");
  if (
    new Set(inventory.files.map((row) => row.path)).size !==
      inventory.files.length ||
    Object.keys(entries).length !== inventory.files.length + 1
  )
    throw Error("工程文件清单不一致");
  for (const row of inventory.files) {
    if ((!allowed(row.path) && !allowedPayload(row.path)) || !entries[row.path])
      throw Error(`工程包包含不允许的文件：${row.path}`);
    const data = entries[row.path];
    checkContent(row.path, data);
    if (data.byteLength !== row.bytes || digest(data) !== row.sha256)
      throw Error(`工程文件校验失败：${row.path}`);
  }
  const payloadPrefix = ".local/native-web/out/";
  const payloadNames = Object.keys(entries).filter((path) => path.startsWith(payloadPrefix));
  const manifestPath = payloadPrefix + "native-resources.json";
  if (!entries[manifestPath]) throw Error("缺少内置资源校验清单");
  const payload = payloadNames.filter((path) => path !== manifestPath).map((path) => ({ path: path.slice(payloadPrefix.length), bytes: entries[path] }));
  verifyResources(JSON.parse(strFromU8(entries[manifestPath])), createResourceManifest(payload));
  for (const prefix of ["native/ios/App/App/public/", "native/harmony/entry/src/main/resources/rawfile/web/"]) {
    if (Object.keys(entries).filter((path) => path.startsWith(prefix)).length !== payloadNames.length) throw Error("两端资源清单不一致");
    for (const path of payloadNames) {
      const copied = entries[prefix + path.slice(payloadPrefix.length)];
      if (!copied || digest(copied) !== digest(entries[path])) throw Error("两端内置资源校验失败");
    }
  }
  validateAssetCatalogReferences(entries);
  return inventory;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const { archive, inventory } = await buildNativeProjectArchive();
    await mkdir("dist", { recursive: true });
    const filename = "EnglishPilot-Xcode-Project-v0.1.3.zip";
    await writeFile(join("dist", filename), archive);
    await writeFile(
      join("dist", `${filename}.sha256`),
      `${digest(archive)}  ${filename}\n`,
    );
    console.log(
      JSON.stringify(
        {
          file: resolve("dist", filename),
          bytes: archive.byteLength,
          files: inventory.files.length,
          artifactType: inventory.artifactType,
          signingVerified: false,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
