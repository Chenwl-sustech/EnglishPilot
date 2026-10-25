import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const routes = [
  "/",
  "/today",
  "/dashboard",
  "/vocabulary",
  "/grammar",
  "/listening",
  "/reading",
  "/speaking",
  "/writing",
  "/exams",
  "/mistakes",
  "/teacher",
  "/analytics",
  "/plan",
  "/settings",
  "/assessment",
  "/calendar",
  "/mini-test",
  "/import-listening",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/apple-touch-icon.png",
];
export async function preparePwa(root = process.cwd()) {
  const version = (await readFile(join(root, ".next/BUILD_ID"), "utf8")).trim();
  if (!/^[\w-]{1,200}$/.test(version)) throw new Error("无效的构建版本");
  const files = [];
  async function walk(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("离线资源不接受符号链接");
      if (entry.isDirectory())
        await walk(join(directory, entry.name), `${prefix}/${entry.name}`);
      else if (entry.isFile() && !entry.name.endsWith(".map"))
        files.push(`${prefix}/${entry.name}`);
    }
  }
  await walk(join(root, ".next/static"), "/_next/static");
  const info = { version, urls: [...routes, ...files.sort()] };
  await writeFile(
    join(root, "public/offline-assets.json"),
    JSON.stringify(info),
  );
  return info;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const info = await preparePwa();
  console.log(
    `PWA 离线资源已准备：${info.urls.length} 项，版本 ${info.version}`,
  );
}
