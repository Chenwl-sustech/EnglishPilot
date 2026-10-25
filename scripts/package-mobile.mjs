import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const release = "2026-10-20";
const archiveName = `EnglishPilot-Mobile-Web-${release}.zip`;
const inventoryName = "PACKAGE-INVENTORY.json";
const sourceFiles = new Set([
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "next-env.d.ts",
  "tsconfig.json",
  "scripts/next.mjs",
  "scripts/prepare-pwa.mjs",
]);
const deploymentFiles = [
  "Dockerfile",
  "compose.yaml",
  "Caddyfile",
  ".env.example",
  ".dockerignore",
  "README.md",
];
const excludedDirectories = new Set([
  ".git",
  ".local",
  ".next",
  "node_modules",
  "dist",
  "tests",
  "__tests__",
  "e2e",
  "coverage",
  "recordings",
  "models",
  "backups",
  "playwright-report",
  "test-results",
]);
const excludedExtensions =
  /\.(?:env|pem|key|pfx|p12|crt|cer|db|sqlite\d*|jsonl|ndjson|log|bak|backup|zip|7z|tar|gz|exe|dll|so|dylib|node|bin|gguf|ggml|onnx|pt|pth|wav|mp3|m4a|aac|ogg|flac|webm|mp4|mov|aiff|caf)$/i;

function safePath(path) {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    !/[\\:\x00-\x1f]/.test(path) &&
    !path.startsWith("/") &&
    path.split("/").every((part) => part && part !== "." && part !== "..")
  );
}

/** Only the application source trees and the exact Linux build inputs may enter a package. */
export function isAllowedSourcePath(path) {
  if (!safePath(path)) return false;
  if (path === "public/offline-assets.json") return false;
  if (path.startsWith("public/") && /\.(?:json|epbackup)$/i.test(path))
    return false;
  const parts = path.split("/");
  if (
    parts.some(
      (part) =>
        part.toLowerCase().startsWith(".env") ||
        excludedDirectories.has(part.toLowerCase()),
    )
  )
    return false;
  if (
    excludedExtensions.test(path) ||
    /(?:^|\/)[^/]*\.(?:test|spec)\.[^/]+$/i.test(path)
  )
    return false;
  return (
    sourceFiles.has(path) ||
    ((parts[0] === "src" || parts[0] === "public") && parts.length > 1)
  );
}

function allowedArchivePath(path) {
  return (
    safePath(path) &&
    (deploymentFiles.includes(path) ||
      path === inventoryName ||
      (path.startsWith("app/") && isAllowedSourcePath(path.slice(4))))
  );
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertNoEmbeddedSecret(path, bytes) {
  const content = strFromU8(bytes);
  if (
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(content) ||
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/.test(content) ||
    /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\b/.test(content) ||
    /\b(?:OPENAI_API_KEY|API_KEY|ACCESS_TOKEN|CLIENT_SECRET)\s*[:=]\s*["'][^"'\r\n]+["']/.test(
      content,
    )
  ) {
    throw new Error(
      `发现疑似内嵌密钥，已停止打包：${path}。错误信息不会显示密钥内容。`,
    );
  }
  if (
    path === ".env.example" &&
    /^[ \t]*(?:OPENAI_API_KEY|OPENAI_MODEL|OPENAI_BASE_URL|OPENAI_REASONING_EFFORT)[ \t]*=[ \t]*[^\s#]/m.test(
      content,
    )
  )
    throw new Error(
      ".env.example 的 AI 配置必须留空，不能携带真实或示例密钥。",
    );
}

async function safeStat(root, path) {
  if (!safePath(path)) throw new Error(`不安全的文件路径：${path}`);
  let target = root;
  let info;
  for (const part of path.split("/")) {
    target = join(target, part);
    info = await lstat(target).catch((error) => {
      throw new Error(
        `打包所需文件不可用：${path} (${error.code || "unknown"})`,
      );
    });
    if (info.isSymbolicLink()) throw new Error(`禁止打包符号链接：${path}`);
  }
  return info;
}

async function readSafeFile(root, path) {
  const info = await safeStat(root, path);
  if (!info.isFile()) throw new Error(`打包内容必须是普通文件：${path}`);
  return new Uint8Array(await readFile(join(root, path)));
}

/** Builds and then independently inspects the ZIP; never opens excluded personal files. */
export async function buildMobileArchive(projectRoot) {
  const root = resolve(projectRoot);
  if ((await lstat(root)).isSymbolicLink())
    throw new Error("项目根目录不能是符号链接。");
  const entries = Object.create(null);
  async function add(sourcePath, archivePath) {
    const bytes = await readSafeFile(root, sourcePath);
    assertNoEmbeddedSecret(archivePath, bytes);
    entries[archivePath] = bytes;
  }
  async function walk(path) {
    const info = await safeStat(root, path);
    if (info.isDirectory()) {
      const basename = path.split("/").at(-1).toLowerCase();
      if (excludedDirectories.has(basename) || basename.startsWith(".env"))
        return;
      for (const name of (await readdir(join(root, path))).sort())
        await walk(`${path}/${name}`);
    } else if (isAllowedSourcePath(path)) {
      await add(path, `app/${path}`);
    }
  }
  for (const path of sourceFiles) await add(path, `app/${path}`);
  await walk("src");
  await walk("public");
  for (const file of deploymentFiles)
    await add(`deployment/mobile/${file}`, file);
  const inventory = {
    schemaVersion: 1,
    app: "EnglishPilot",
    release,
    files: Object.keys(entries)
      .sort()
      .map((path) => ({
        path,
        bytes: entries[path].byteLength,
        sha256: digest(entries[path]),
      })),
  };
  entries[inventoryName] = strToU8(JSON.stringify(inventory, null, 2) + "\n");
  const archive = zipSync(entries, {
    level: 9,
    mtime: new Date(`${release}T00:00:00Z`),
  });
  validateMobileArchive(archive);
  return { archive, inventory };
}

/** Checks archive paths, payload digests, required inputs and obvious embedded credentials. */
export function validateMobileArchive(archive) {
  const entries = unzipSync(archive);
  for (const path of Object.keys(entries)) {
    if (!allowedArchivePath(path))
      throw new Error(`归档中有不允许的路径：${path}`);
    assertNoEmbeddedSecret(path, entries[path]);
  }
  if (!entries[inventoryName]) throw new Error("归档缺少文件清单。");
  const inventory = JSON.parse(strFromU8(entries[inventoryName]));
  if (
    inventory.schemaVersion !== 1 ||
    inventory.app !== "EnglishPilot" ||
    !Array.isArray(inventory.files)
  )
    throw new Error("文件清单格式不正确。");
  const names = new Set();
  for (const item of inventory.files) {
    if (
      !item ||
      typeof item.path !== "string" ||
      item.path === inventoryName ||
      !allowedArchivePath(item.path) ||
      names.has(item.path)
    )
      throw new Error("文件清单包含重复或不允许的路径。");
    names.add(item.path);
    const bytes = entries[item.path];
    if (
      !bytes ||
      item.bytes !== bytes.byteLength ||
      item.sha256 !== digest(bytes)
    )
      throw new Error(`SHA256 摘要校验失败：${item.path}`);
  }
  if (names.size !== Object.keys(entries).length - 1)
    throw new Error("归档内容与文件清单不一致。");
  for (const path of [
    ...deploymentFiles,
    ...[...sourceFiles].map((path) => `app/${path}`),
  ])
    if (!names.has(path)) throw new Error(`归档缺少部署所需文件：${path}`);
  if (
    ![...names].some((path) => path.startsWith("app/src/")) ||
    ![...names].some((path) => path.startsWith("app/public/"))
  )
    throw new Error("归档缺少应用源代码或公共资源。");
  return inventory;
}

export async function writeMobilePackage(projectRoot) {
  const root = resolve(projectRoot);
  const { archive, inventory } = await buildMobileArchive(root);
  const outputDirectory = join(root, "dist");
  try {
    if ((await lstat(outputDirectory)).isSymbolicLink())
      throw new Error("dist 不能是符号链接。");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(outputDirectory, { recursive: true });
  const archivePath = join(outputDirectory, archiveName);
  const sha256Path = archivePath + ".sha256";
  const inventoryPath = join(
    outputDirectory,
    archiveName.replace(/\.zip$/, ".inventory.json"),
  );
  // No cleanup or recursive delete: only these three generated files are replaced.
  for (const path of [archivePath, sha256Path, inventoryPath]) {
    try {
      if ((await lstat(path)).isSymbolicLink())
        throw new Error("输出文件不能是符号链接。");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const within = relative(outputDirectory, path);
    if (within.startsWith(`..${sep}`) || within === "..")
      throw new Error("不安全的输出路径。");
  }
  await writeFile(archivePath, archive);
  await writeFile(sha256Path, `${digest(archive)}  ${archiveName}\n`);
  await writeFile(inventoryPath, JSON.stringify(inventory, null, 2) + "\n");
  validateMobileArchive(await readFile(archivePath));
  return {
    archivePath,
    sha256Path,
    inventoryPath,
    fileCount: inventory.files.length,
    bytes: archive.byteLength,
  };
}

const invokedPath = process.argv[1] && resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  writeMobilePackage(root)
    .then((result) => {
      console.log(`已生成并检查移动网页部署包：${result.archivePath}`);
      console.log(
        `${result.fileCount} 个文件，${result.bytes} 字节；SHA256：${result.sha256Path}`,
      );
      console.log(
        "此包包含源码与部署说明；未向外部平台发布，未验证实际容器或移动设备安装。",
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
