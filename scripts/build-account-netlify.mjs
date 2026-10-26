import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildAccountWeb } from "./build-account-web.mjs";

const template = fileURLToPath(new URL("../web-cloud/", import.meta.url));
const marker = ".englishpilot-account-netlify";
async function rejectLinks(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw Error("部署内容不接受符号链接");
  if (info.isDirectory())
    for (const name of await readdir(path)) await rejectLinks(join(path, name));
}
/** Repackage only known inputs; runtime secrets and other deploy roots stay out. */
export async function assembleAccountNetlify(publicSource, destination) {
  publicSource = resolve(publicSource);
  destination = resolve(destination);
  if (
    publicSource === destination ||
    publicSource.startsWith(destination + sep) ||
    destination.startsWith(publicSource + sep)
  )
    throw Error("部署目录不能覆盖或包含静态源目录");
  await rejectLinks(publicSource);
  for (const name of [
    "server",
    "netlify-functions",
    "package.json",
    "netlify.toml",
  ])
    await rejectLinks(join(template, name));
  const old = await lstat(destination).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (old) {
    if (
      old.isSymbolicLink() ||
      !old.isDirectory() ||
      (await readFile(join(destination, marker), "utf8").catch(() => "")) !==
        "account-netlify-v1\n"
    )
      throw Error("拒绝覆盖未识别的 Netlify 部署目录");
    for (const name of ["public", "functions", "server"]) {
      const target = join(destination, name);
      if ((await lstat(target).catch(() => null))?.isSymbolicLink())
        throw Error("部署内容不接受符号链接");
      await rm(target, { recursive: true, force: true });
    }
  } else await mkdir(destination, { recursive: true });
  await writeFile(join(destination, marker), "account-netlify-v1\n");
  await cp(publicSource, join(destination, "public"), { recursive: true });
  await cp(join(template, "server"), join(destination, "server"), {
    recursive: true,
  });
  await cp(
    join(template, "netlify-functions"),
    join(destination, "functions"),
    { recursive: true },
  );
  for (const name of ["package.json", "netlify.toml"])
    await cp(join(template, name), join(destination, name));
  return destination;
}
export async function buildAccountNetlify(root = process.cwd()) {
  root = resolve(root);
  const source = await buildAccountWeb(root);
  const destination = await assembleAccountNetlify(
    join(source, "public"),
    join(root, ".local/account-netlify-deploy"),
  );
  process.stdout.write(
    `Netlify 账号网页版已准备：${destination}\n服务器环境变量须通过本人云账号单独配置。\n`,
  );
  return destination;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  buildAccountNetlify().catch((error) => {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  });
