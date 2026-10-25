import { z } from "zod";
const model = z.enum(["tiny", "base", "small"]);
const base = "http://127.0.0.1:8765";
async function local(path: string, init: RequestInit, fetcher: typeof fetch) {
  let response: Response;
  try {
    response = await fetcher(base + path, {
      ...init,
      signal: AbortSignal.timeout(
        path.startsWith("/v1/transcriptions") ? 180000 : 10000,
      ),
    });
  } catch {
    throw new Error(
      "本地 Whisper 未连接或转写超时。请先运行 npm run whisper，录音仍安全保留。",
    );
  }
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error?.message ?? `本地服务错误 ${response.status}`);
  return body;
}
export async function whisperStatus(fetcher: typeof fetch = fetch) {
  const result = await local("/health", {}, fetcher);
  if (result.service !== "englishpilot-whisper" || result.localOnly !== true)
    throw new Error("8765 端口不是 EnglishPilot 本地 Whisper 服务");
  return result;
}
export async function downloadLocalModel(
  name: string,
  confirmed: boolean,
  fetcher: typeof fetch = fetch,
) {
  model.parse(name);
  if (!confirmed) throw new Error("请先确认模型下载");
  return local(
    `/v1/models/${name}/download`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    },
    fetcher,
  );
}
export async function transcribeLocal(
  bytes: Uint8Array,
  name: string,
  type: string,
  fetcher: typeof fetch = fetch,
) {
  model.parse(name);
  if (!bytes.length || bytes.length > 30000000)
    throw new Error("音频必须为 1 字节至 30 MB");
  return local(
    `/v1/transcriptions?model=${name}&language=en&device=cpu`,
    {
      method: "POST",
      headers: { "Content-Type": type || "application/octet-stream" },
      body: bytes as BodyInit,
    },
    fetcher,
  );
}
