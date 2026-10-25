import { randomUUID } from "node:crypto";
import {
  mkdir,
  writeFile,
  link,
  unlink,
  readFile,
  stat,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  importRunSchema,
  listeningImportReceiptInput,
  listeningImportReceiptSchema,
} from "../listening-import-receipt-model";
import { sameOrigin } from "./http";
import {
  type CloudStateStore,
  getCloudStateStore,
  usesCloudState,
} from "./cloud-state";
import { readAiRequest, AiRequestError } from "./ai-quota";
export function createListeningImportReceipts({
  directory,
  now = () => new Date(),
  cloud,
}: {
  directory: string;
  now?: () => Date;
  cloud?: () => CloudStateStore;
}) {
  const root = resolve(directory);
  async function read(raw: string) {
    const run = importRunSchema.parse(raw),
      path = join(root, `${run}.json`);
    try {
      if (cloud) {
        const raw = await cloud().read(`import:${run}`);
        if (raw === null) return { status: "pending" as const, run };
        const saved = listeningImportReceiptSchema.parse(raw);
        if (saved.input.run !== run) throw new Error("导入回执编号不匹配");
        return {
          status: "completed" as const,
          run,
          receipt: { ...saved.input, completedAt: saved.completedAt },
        };
      }
      const info = await stat(path);
      if (!info.isFile() || info.size > 16384) throw new Error("导入回执损坏");
      const saved = listeningImportReceiptSchema.parse(
        JSON.parse(await readFile(path, "utf8")),
      );
      if (saved.input.run !== run) throw new Error("导入回执编号不匹配");
      return {
        status: "completed" as const,
        run,
        receipt: { ...saved.input, completedAt: saved.completedAt },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { status: "pending" as const, run };
      throw error;
    }
  }
  return {
    read,
    async save(raw: unknown) {
      const input = listeningImportReceiptInput.parse(raw),
        path = join(root, `${input.run}.json`);
      if (cloud) {
        await cloud().initialize(`import:${input.run}`, {
          input,
          completedAt: now().toISOString(),
        });
        const saved = await read(input.run);
        if (saved.status !== "completed")
          throw new Error("云端导入回执保存失败");
        return saved;
      }
      await mkdir(root, { recursive: true });
      const temporary = join(root, `${input.run}.${randomUUID()}.tmp`);
      try {
        await writeFile(
          temporary,
          JSON.stringify({ input, completedAt: now().toISOString() }),
          { flag: "wx" },
        );
        try {
          await link(temporary, path);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
      } finally {
        await unlink(temporary).catch(() => {});
      }
      const saved = await read(input.run);
      if (saved.status !== "completed") throw new Error("回执保存失败");
      return saved;
    },
  };
}
export function createListeningImportReceiptHandlers(
  store: ReturnType<typeof createListeningImportReceipts>,
) {
  const headers = { "Cache-Control": "no-store" };
  function allowed(r: Request, write = false) {
    const origin = r.headers.get("origin");
    return (
      sameOrigin(r) &&
      r.headers.get("sec-fetch-site") !== "cross-site" &&
      (!write ||
        (!!origin && new URL(origin).protocol === new URL(r.url).protocol))
    );
  }
  return {
    async GET(request: Request) {
      if (!allowed(request))
        return Response.json(
          { error: "不接受跨站读取" },
          { status: 403, headers },
        );
      try {
        return Response.json(
          await store.read(new URL(request.url).searchParams.get("run") ?? ""),
          { headers },
        );
      } catch {
        return Response.json(
          { error: "导入回执不存在或不可读取" },
          { status: 400, headers },
        );
      }
    },
    async POST(request: Request) {
      if (!allowed(request, true))
        return Response.json(
          { error: "仅接受同源页面提交" },
          { status: 403, headers },
        );
      try {
        return Response.json(
          await store.save(await readAiRequest(request, 4096)),
          { headers },
        );
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof AiRequestError
                ? "回执请求过大或格式无效"
                : "导入回执无法保存，请重试确认；已保存的素材会保留",
          },
          {
            status: error instanceof AiRequestError ? error.status : 400,
            headers,
          },
        );
      }
    },
  };
}
export const listeningImportReceipts = createListeningImportReceipts({
  ...(usesCloudState() ? { cloud: getCloudStateStore } : {}),
  directory: ".local/listening-import-receipts",
});
