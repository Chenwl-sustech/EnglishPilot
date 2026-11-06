const LIMIT = 4 * 1024 * 1024 + 65536;
const json = (error, status) =>
  Response.json(
    { error },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
const requestHeaders = new Set([
  "authorization",
  "apikey",
  "content-type",
  "accept",
  "x-client-info",
  "x-supabase-api-version",
  "x-upsert",
  "cache-control",
  "prefer",
  "accept-profile",
  "content-profile",
  "range",
  "range-unit",
]);
function allowed(path, method) {
  if (path === "/rest/v1/englishpilot_sync_heads") return method === "GET";
  if (path === "/rest/v1/rpc/englishpilot_sync_commit")
    return method === "POST";
  if (path === "/auth/v1/user") return ["GET", "PUT"].includes(method);
  if (path === "/auth/v1/settings") return method === "GET";
  if (
    /^\/auth\/v1\/(token|signup|logout|recover|verify|resend|otp)$/.test(path)
  )
    return method === "POST";
  return (
    ["GET", "POST"].includes(method) &&
    /^\/storage\/v1\/object\/(authenticated\/)?englishpilot-sync\/[a-f0-9-]{36}\/chunks\/[a-f0-9]{64}$/.test(
      path,
    )
  );
}
async function boundedBytes(message, signal) {
  if (!message.body) return new Uint8Array();
  const reader = message.body.getReader(),
    chunks = [];
  let length = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > LIMIT) {
        await reader.cancel();
        throw Error("payload limit");
      }
      chunks.push(part.value);
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}
/** Fixed-project relay; upstream Supabase enforces auth and row/storage ownership. */
/** @param {Request} request @param {Record<string, string | undefined>} env @param {(url: string, init: RequestInit) => Promise<Response>} fetcher */
async function syncResponse(request, env = process.env, fetcher = fetch) {
  let project;
  try {
    project = new URL(env.SUPABASE_URL);
    if (
      !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(env.SUPABASE_URL) ||
      !env.SUPABASE_PUBLISHABLE_KEY
    )
      throw Error();
  } catch {
    return json("账号转发尚未配置", 503);
  }
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin && origin !== "capacitor://localhost")
    return json("不接受此来源", 403);
  const preflight = request.method === "OPTIONS";
  const method = preflight
    ? request.headers.get("access-control-request-method")
    : request.method;
  const match = /^\/api\/sync\/([a-z0-9-]+)(\/[^%?#\\]*)$/.exec(url.pathname);
  if (
    !match ||
    match[1] + ".supabase.co" !== project.hostname ||
    !allowed(match[2], method) ||
    request.url.length > 8192
  )
    return json("账号转发接口不存在", 404);
  if (preflight) {
    const requested = (
      request.headers.get("access-control-request-headers") ?? ""
    )
      .toLowerCase()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (
      origin !== "capacitor://localhost" ||
      requested.length > 16 ||
      requested.some((s) => !requestHeaders.has(s))
    )
      return json("不接受此预检请求", 403);
    return new Response(null, {
      status: 204,
      headers: {
        "cache-control": "no-store",
        "access-control-allow-methods": method,
        "access-control-allow-headers": requested.join(", "),
      },
    });
  }
  if (request.headers.get("apikey") !== env.SUPABASE_PUBLISHABLE_KEY)
    return json("账号项目公开配置不匹配", 401);
  const authorization = request.headers.get("authorization");
  if (
    !match[2].startsWith("/auth/") &&
    !/^Bearer [^\s]{1,8192}$/.test(authorization || "")
  )
    return json("请先登录学习账号", 401);
  const headers = new Headers();
  let headerSize = 0;
  for (const [name, value] of request.headers) {
    if (!requestHeaders.has(name)) continue;
    headerSize += name.length + value.length;
    if (value.length > 8192 || /[^\x20-\x7e]/.test(value) || headerSize > 32768)
      return json("账号请求头无效", 400);
    headers.set(name, value);
  }
  const deadline = new AbortController(),
    timer = setTimeout(() => deadline.abort(), 40000);
  const signal = AbortSignal.any([request.signal, deadline.signal]);
  try {
    let body;
    try {
      if (["POST", "PUT"].includes(method))
        body = await boundedBytes(request, signal);
    } catch {
      return json("账号请求过大或已取消", 413);
    }
    const response = await fetcher(project.origin + match[2] + url.search, {
      method,
      headers,
      ...(body ? { body } : {}),
      redirect: "error",
      signal,
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw Error("redirect");
    }
    const bytes = await boundedBytes(response, signal);
    const output = new Headers({
      "cache-control": "no-store",
      vary: "Authorization, apikey",
      "x-content-type-options": "nosniff",
    });
    for (const name of [
      "content-type",
      "etag",
      "content-range",
      "last-modified",
    ]) {
      const value = response.headers.get(name);
      if (value && value.length <= 8192) output.set(name, value);
    }
    return new Response([204, 205].includes(response.status) ? null : bytes, {
      status: response.status,
      headers: output,
    });
  } catch {
    return json("账号云端连接失败或超时；本机内容仍保留，请重试", 502);
  } finally {
    clearTimeout(timer);
  }
}

/** @param {Request} request @param {Record<string, string | undefined>} env @param {(url: string, init: RequestInit) => Promise<Response>} fetcher */
export async function syncGatewayResponse(
  request,
  env = process.env,
  fetcher = fetch,
) {
  const response = await syncResponse(request, env, fetcher);
  if (request.headers.get("origin") === "capacitor://localhost") {
    response.headers.set(
      "access-control-allow-origin",
      "capacitor://localhost",
    );
    response.headers.set(
      "access-control-expose-headers",
      "content-range, etag",
    );
    response.headers.set("vary", "Origin, Authorization, apikey");
  }
  return response;
}
