import { HARMONY_AI_ORIGIN, harmonyRequestAllowed } from "./harmony-policy";

export type SyncRelay = { origin: string; project: string };
/** Shared native relay mapping preserves the Supabase project used as account identity. */
export function createSyncRelayFetch(
  fetcher: typeof fetch,
  relay: SyncRelay,
): typeof fetch {
  if (
    relay.origin !== HARMONY_AI_ORIGIN ||
    !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(relay.project)
  )
    throw new Error("安装版账号转发配置无效");
  return async (input, init) => {
    const original = new Request(input, init);
    if (!original.url.startsWith(relay.project + "/")) return fetcher(original);
    if (!harmonyRequestAllowed(original.url, original.method))
      throw new Error("安装版账号转发接口无效");
    const ref = relay.project.slice("https://".length, -".supabase.co".length);
    const address = `${relay.origin}/api/sync/${ref}${original.url.slice(relay.project.length)}`;
    const request = new Request(address, original),
      transport = fetcher;
    if (
      request.method !== "GET" ||
      request.headers.has("range") ||
      !original.url.startsWith(relay.project + "/storage/v1/object/")
    )
      return fetcher(request);
    const step = 256 * 1024;
    const pieces: Uint8Array[] = [];
    let offset = 0,
      total = 0,
      firstHeaders: Headers | undefined;
    do {
      request.signal.throwIfAborted();
      const end = total ? Math.min(offset + step, total) - 1 : step - 1;
      const headers = new Headers(request.headers);
      headers.set("range", `bytes=${offset}-${end}`);
      const response = await transport(request, { headers });
      if (offset === 0 && response.status !== 206) return response;
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
        response.headers.get("content-range") ?? "",
      );
      if (response.status !== 206 || !match)
        throw new Error("云端音频分段响应无效，保留本机数据");
      const start = Number(match[1]),
        last = Number(match[2]),
        size = Number(match[3]);
      if (
        ![start, last, size].every(Number.isSafeInteger) ||
        size < 1 ||
        size > 4 * 1024 * 1024 ||
        start !== offset ||
        (total && total !== size) ||
        last !== Math.min(end, size - 1)
      )
        throw new Error("云端音频分段范围不一致，保留本机数据");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== last - start + 1)
        throw new Error("云端音频分段长度不一致，保留本机数据");
      firstHeaders ??= new Headers(response.headers);
      pieces.push(bytes);
      offset += bytes.length;
      total = size;
    } while (offset < total);
    request.signal.throwIfAborted();
    const joined = new Uint8Array(total);
    let at = 0;
    for (const piece of pieces) {
      joined.set(piece, at);
      at += piece.length;
    }
    firstHeaders?.delete("content-range");
    return new Response(joined, { status: 200, headers: firstHeaders });
  };
}
