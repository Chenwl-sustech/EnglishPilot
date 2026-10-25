import { createHash } from "node:crypto";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { bundledResourcePath } from "../src/lib/native/resource-path.ts";

export const appOrigin = "https://englishpilot.local";
const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

export function safeResourcePath(path) {
  return (
    typeof path === "string" &&
    /^[\w.$\[\]/-]+$/.test(path) &&
    !path.startsWith("/") &&
    path
      .split("/")
      .every(
        (part) =>
          part && part !== "." && part !== ".." && !part.startsWith("."),
      )
  );
}

export function createResourceManifest(files) {
  const resources = Object.create(null);
  for (const { path, bytes } of files) {
    if (
      !safeResourcePath(path) ||
      /(?:^|\/)(?:recordings|backups|models|api|node_modules)(?:\/|$)/i.test(
        path,
      ) ||
      !mimeTypes[extname(path)] ||
      resources[`/${path}`]
    )
      throw Error(`不允许的内置资源：${path}`);
    if ([".js", ".html", ".json", ".txt"].includes(extname(path))) {
      const text = new TextDecoder().decode(bytes);
      if (
        /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b|-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\b/.test(
          text,
        )
      )
        throw Error(`内置资源发现疑似密钥：${path}`);
    }
    resources[`/${path}`] = {
      file: path,
      bytes: bytes.byteLength,
      mime: mimeTypes[extname(path)],
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }
  return { version: 1, origin: appOrigin, resources };
}

export function resourceForUrl(manifest, rawUrl) {
  if (typeof rawUrl !== "string") return null;
  const path = bundledResourcePath(rawUrl, appOrigin);
  if (path === null) return null;
  const direct = manifest.resources[path];
  if (direct) return direct;
  return manifest.resources[`${path.replace(/\/$/, "")}/index.html`] ?? null;
}

export async function readResourceFiles(root) {
  if ((await lstat(root)).isSymbolicLink())
    throw Error("内置资源根目录禁止符号链接");
  const files = [];
  async function walk(path = "") {
    for (const name of (await readdir(join(root, path))).sort()) {
      const relative = path ? `${path}/${name}` : name;
      if (relative === "native-resources.json") continue;
      const info = await lstat(join(root, relative));
      if (info.isSymbolicLink()) throw Error("内置资源禁止符号链接");
      if (info.isDirectory()) await walk(relative);
      else
        files.push({
          path: relative,
          bytes: new Uint8Array(await readFile(join(root, relative))),
        });
    }
  }
  await walk();
  return files;
}

export async function writeResourceManifest(root) {
  const manifest = createResourceManifest(await readResourceFiles(root));
  await writeFile(
    join(root, "native-resources.json"),
    JSON.stringify(manifest),
  );
  return manifest;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  writeResourceManifest(resolve(".local/native-web/out"))
    .then((manifest) =>
      process.stdout.write(
        `已校验 ${Object.keys(manifest.resources).length} 个内置资源\n`,
      ),
    )
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
