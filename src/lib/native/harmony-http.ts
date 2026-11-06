import { createSyncRelayFetch, type SyncRelay } from "./sync-relay";
import {
  createHarmonyRpc,
  harmonyBridge,
  type HarmonyRpc,
} from "./harmony-rpc";
import {
  HARMONY_BODY_LIMIT,
  harmonyHeaders,
  harmonyRequestAllowed,
} from "./harmony-policy";

export function base64Bytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

function createHarmonyTransport(rpc: Pick<HarmonyRpc, "call">): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    request.signal.throwIfAborted();
    if (!harmonyRequestAllowed(request.url, request.method))
      throw new Error("鸿蒙安装版不允许访问此接口");
    const headers = harmonyHeaders(
      Object.fromEntries(request.headers.entries()),
    );
    const bytes = request.body
      ? new Uint8Array(await request.arrayBuffer())
      : null;
    if (bytes && bytes.byteLength > HARMONY_BODY_LIMIT)
      throw new Error("网络请求内容超过 5 MB 上限");
    request.signal.throwIfAborted();
    const raw = await rpc.call(
      "http",
      [
        JSON.stringify({
          url: request.url,
          method: request.method,
          headers,
          ...(bytes ? { bodyBase64: base64Bytes(bytes) } : {}),
        }),
      ],
      request.signal,
    );
    request.signal.throwIfAborted();
    if (typeof raw !== "string" || raw.length > 8 * 1024 * 1024)
      throw new Error("鸿蒙网络响应无效");
    const value = JSON.parse(raw) as {
      status: number;
      headers: Record<string, string>;
      bodyBase64: string;
    };
    if (value.status >= 300 && value.status < 400)
      throw new Error("在线接口发生重定向，已停止请求");
    if (
      !Number.isInteger(value.status) ||
      value.status < 200 ||
      value.status > 599 ||
      typeof value.bodyBase64 !== "string" ||
      value.bodyBase64.length > Math.ceil(HARMONY_BODY_LIMIT / 3) * 4 ||
      value.bodyBase64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(value.bodyBase64) ||
      !value.headers ||
      typeof value.headers !== "object"
    )
      throw new Error("鸿蒙网络响应无效");
    let binary: string;
    try {
      binary = atob(value.bodyBase64);
    } catch {
      throw new Error("鸿蒙网络响应编码无效");
    }
    if (binary.length > HARMONY_BODY_LIMIT) throw new Error("网络响应超过上限");
    const body = new Uint8Array(binary.length);
    for (let i = 0; i < body.length; i++) body[i] = binary.charCodeAt(i);
    const responseHeaders = new Headers();
    for (const [name, content] of Object.entries(value.headers)) {
      if (
        [
          "content-type",
          "cache-control",
          "etag",
          "content-range",
          "last-modified",
        ].includes(name.toLowerCase()) &&
        typeof content === "string" &&
        content.length <= 8192
      )
        responseHeaders.set(name, content);
    }
    return new Response([204, 205].includes(value.status) ? null : body, {
      status: value.status,
      headers: responseHeaders,
    });
  };
}

/** Keep individual native responses small on mobile networks; stored hashes remain unchanged. */
export function createHarmonyFetch(
  rpc: Pick<HarmonyRpc, "call">,
  relay?: SyncRelay,
): typeof fetch {
  const transport = createHarmonyTransport(rpc);
  return relay ? createSyncRelayFetch(transport, relay) : transport;
}

export function harmonySyncTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): number {
  const address =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  return method === "GET" &&
    address.includes("/storage/v1/object/") &&
    harmonyRequestAllowed(address, method)
    ? 180000
    : 45000;
}

/** The RPC channel is shared by authenticated HTTP requests, never by iOS. */
let transport: ReturnType<typeof createHarmonyFetch> | undefined;
export function harmonyFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const bridge = harmonyBridge();
  if (!bridge) throw new Error("鸿蒙设备网络接口尚未就绪");
  const relayOrigin =
    process.env.NEXT_PUBLIC_NATIVE_SYNC_RELAY ??
    process.env.NEXT_PUBLIC_HARMONY_SYNC_RELAY;
  const project = process.env.NEXT_PUBLIC_SUPABASE_URL;
  transport ??= createHarmonyFetch(
    createHarmonyRpc(bridge),
    relayOrigin && project ? { origin: relayOrigin, project } : undefined,
  );
  return transport(input, init);
}
