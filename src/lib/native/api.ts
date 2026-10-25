import { nativeBuild } from "./runtime";
import { requestNativeAi, type NativeAiTransport } from "./ai";

export const nativeServiceMessage =
  "安装版尚未连接在线后端，AI 评价、额度查询和在线素材导入暂不可用。离线训练、草稿和录音仍保留；未上传练习内容。";

/** Explicit boundary: bundled clients never mistake an HTML fallback for an API. */
export function createApiFetch({
  native,
  fetcher = (...args) => globalThis.fetch(...args),
  transport = requestNativeAi,
}: {
  native: boolean;
  fetcher?: typeof fetch;
  transport?: NativeAiTransport;
}): typeof fetch {
  return async (input, init) => {
    if (!native) return fetcher(input, init);
    const signal =
      init?.signal ?? (input instanceof Request ? input.signal : null);
    signal?.throwIfAborted();
    const path =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    if (!["/api/evaluate", "/api/teacher", "/api/configuration", "/api/ai-usage"].includes(path) || !["GET", "POST"].includes(method))
      return Response.json({ error: "此安装版在线接口暂不可用；离线训练、草稿和录音仍保留。" }, { status: 503 });
    const rawBody = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
    if (rawBody !== undefined && rawBody !== null && typeof rawBody !== "string")
      return Response.json({ error: "AI 接口只接受 JSON 文本。" }, { status: 400 });
    try {
      signal?.throwIfAborted();
      const pending = transport({ path, method, ...(rawBody == null ? {} : { body: rawBody }) });
      const result = await new Promise<Awaited<ReturnType<NativeAiTransport>>>((resolve, reject) => {
        const abort = () => reject(signal?.reason ?? new DOMException("请求已取消", "AbortError"));
        signal?.addEventListener("abort", abort, { once: true });
        pending.then(resolve, reject).finally(() => signal?.removeEventListener("abort", abort));
      });
      signal?.throwIfAborted();
      if (!Number.isInteger(result.status) || result.status < 200 || result.status > 599 || typeof result.body !== "string" || result.body.length > 2 * 1024 * 1024)
        throw new Error("后端响应无效，请检查连接。");
      try {
        const body: unknown = JSON.parse(result.body);
        if (body === null || typeof body !== "object" || Array.isArray(body)) throw new Error();
      } catch {
        return Response.json({ error: "后端没有返回有效 JSON，请检查连接或访问授权。" }, { status: 502 });
      }
      return new Response(result.body, { status: result.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    } catch (error) {
      signal?.throwIfAborted();
      const message = error instanceof Error ? error.message : "在线后端连接失败，请检查网络后重试。";
      if (path === "/api/evaluate" && method === "GET")
        return Response.json({ configured: false, local: false, model: "", message });
      return Response.json({ error: message }, { status: 503 });
    }
  };
}

export const apiFetch = createApiFetch({ native: nativeBuild });
