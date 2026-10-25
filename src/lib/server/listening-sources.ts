import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { unzipSync } from "fflate";
import {
  officialListeningCatalog,
  type OfficialListeningSource,
} from "../data/official-listening";
import { listeningImportSchema } from "../listening-material-model";

const allowedHosts = new Set([
  "www.ets.org",
  "ielts.org",
  "www.ielts.org",
  "takeielts.britishcouncil.org",
]);
function safeUrl(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    !allowedHosts.has(u.hostname) ||
    (u.port && u.port !== "443")
  )
    throw new Error("官方下载地址或跳转不受支持");
  return u.href;
}
export function selectedZipAudio(bytes: Uint8Array, entry: string): Uint8Array {
  if (
    !entry ||
    entry.startsWith("/") ||
    entry.includes("\\") ||
    entry.split("/").includes("..")
  )
    throw new Error("压缩包音轨路径无效");
  let count = 0,
    selected = false;
  const files = unzipSync(bytes, {
    filter(file) {
      if (++count > 1000) throw new Error("压缩包文件过多");
      if (file.name !== entry) return false;
      if (
        selected ||
        file.originalSize < 1 ||
        file.originalSize > 128 * 1024 * 1024 ||
        file.originalSize > Math.max(1024 * 1024, file.size * 500)
      )
        throw new Error("音轨大小或压缩比例不受支持");
      selected = true;
      return true;
    },
  });
  if (!files[entry]) throw new Error("官方压缩包中没有所选音轨，可能已更新");
  return files[entry];
}
async function boundedFile(path: string, max: number) {
  const info = await stat(path);
  if (!info.isFile() || info.size > max)
    throw new Error("本地素材超过大小上限");
  return readFile(path);
}
export function createOfficialListeningStore(options: {
  directory: string;
  catalog?: OfficialListeningSource[];
  fetcher?: typeof fetch;
}) {
  const root = resolve(options.directory),
    catalog = options.catalog ?? officialListeningCatalog,
    fetcher = options.fetcher ?? fetch;
  const pending = new Map<
    string,
    Promise<{ bytes: Uint8Array; cached: boolean }>
  >();
  const find = (id: string) => {
    const item = catalog.find((c) => c.id === id);
    if (!item || !/^[a-z0-9][a-z0-9-]{0,100}$/u.test(id))
      throw new Error("请从已核实的官方目录选择素材");
    return item;
  };
  function verify(bytes: Uint8Array, item: OfficialListeningSource) {
    if (
      bytes.byteLength !== item.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== item.sha256
    )
      throw new Error("官方音频校验失败，源文件可能已变化；未导入");
    return Uint8Array.from(bytes);
  }
  async function cached(item: OfficialListeningSource) {
    try {
      return verify(
        await boundedFile(join(root, `${item.id}.mp3`), 128 * 1024 * 1024),
        item,
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    try {
      const manifest = JSON.parse(
        (
          await boundedFile(join(root, "manifest.json"), 5 * 1024 * 1024)
        ).toString("utf8"),
      );
      const path = manifest[item.id]?.audioPath;
      if (!path) return null;
      const candidate = resolve(path),
        within = relative(root, candidate);
      if (
        within.startsWith("..") ||
        isAbsolute(within) ||
        !/\.mp3$/iu.test(candidate)
      )
        throw new Error("本地素材清单路径无效");
      return verify(await boundedFile(candidate, 128 * 1024 * 1024), item);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  async function download(id: string, force = false) {
    const item = find(id);
    const active = pending.get(id);
    if (active) return active;
    const run = (async () => {
      if (!force) {
        const bytes = await cached(item);
        if (bytes) return { bytes, cached: true };
      }
      let url = safeUrl(item.audioUrl),
        response: Response | undefined;
      for (let i = 0; i < 4; i++) {
        response = await fetcher(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(60000),
          headers: {
            Accept: "audio/mpeg,application/zip,application/octet-stream",
          },
        });
        if (response.status < 300 || response.status >= 400) break;
        const location = response.headers.get("Location");
        if (!location) throw new Error("官方下载跳转异常");
        url = safeUrl(new URL(location, url).href);
      }
      if (!response?.ok || !response.body)
        throw new Error(
          `官方下载失败（${response?.status ?? "连接不可用"}），请检查网络或从官方页面手动下载`,
        );
      const max = 64 * 1024 * 1024;
      if (Number(response.headers.get("Content-Length")) > max)
        throw new Error("官方下载超过64 MB大小上限");
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const r = await reader.read();
          if (r.done) break;
          size += r.value.byteLength;
          if (size > max) throw new Error("官方下载超过64 MB大小上限");
          chunks.push(r.value);
        }
      } catch (e) {
        void reader.cancel();
        throw e;
      } finally {
        reader.releaseLock();
      }
      const packed = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        packed.set(c, offset);
        offset += c.length;
      }
      const bytes = verify(
        item.archiveEntry
          ? selectedZipAudio(packed, item.archiveEntry)
          : packed,
        item,
      );
      await mkdir(root, { recursive: true });
      const temp = join(root, `${id}-${randomUUID()}.tmp`);
      await writeFile(temp, bytes, { flag: "wx" });
      await rename(temp, join(root, `${id}.mp3`));
      return { bytes, cached: false };
    })();
    pending.set(id, run);
    try {
      return await run;
    } finally {
      if (pending.get(id) === run) pending.delete(id);
    }
  }
  return {
    download,
    async metadata(id: string) {
      const item = find(id);
      let seed: unknown;
      try {
        seed = JSON.parse(
          (
            await boundedFile(join(root, "seed.json"), 10 * 1024 * 1024)
          ).toString("utf8"),
        )[id];
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT")
          throw new Error("本地配套原文与题目读取失败，请重新导入标注");
      }
      const metadata = listeningImportSchema.parse(
        seed ?? {
          title: item.title,
          exam: item.exam,
          version: item.version,
          publisher: item.publisher,
          sourceUrl: item.pageUrl,
          license:
            "版权所有；仅按来源条款用于个人、非商业学习，不随软件再分发。",
          licenseUrl: item.termsUrl,
          duration: item.duration,
          transcript: "",
          segments: [],
          questions: [],
        },
      );
      return { source: item, metadata, pairedAnnotations: !!seed };
    },
  };
}
export const officialListeningStore = createOfficialListeningStore({
  directory:
    process.env.VERCEL === "1"
      ? join(tmpdir(), "englishpilot-official-listening")
      : ".local/official-listening",
});
