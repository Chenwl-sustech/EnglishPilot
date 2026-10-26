const paths = new Set([
  "/api/evaluate",
  "/api/teacher",
  "/api/configuration",
  "/api/ai-usage",
]);
const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Vary: "Authorization",
      "X-Content-Type-Options": "nosniff",
    },
  });
function origin(value, suffix) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !url.hostname.endsWith(suffix)
  )
    throw Error("Invalid server configuration");
  return url.origin;
}
async function boundedText(response, max = 2 * 1024 * 1024) {
  if (!response.body) return "";
  const reader = response.body.getReader(),
    chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > max) {
        await reader.cancel();
        throw Error("Response too large");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(bytes);
  let at = 0;
  for (const chunk of chunks) {
    result.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(result);
}
/** A separate, account-authorized gateway. Existing paired-device backend stays private. */
/** @param {Request} request @param {Record<string, string | undefined>} env @param {typeof fetch} fetcher */
export async function accountWebResponse(
  request,
  env = process.env,
  fetcher = fetch,
) {
  const url = new URL(request.url),
    method = request.method.toUpperCase();
  if (!paths.has(url.pathname) || url.search)
    return json({ error: "接口不存在" }, 404);
  if (
    !["GET", "POST"].includes(method) ||
    (url.pathname === "/api/teacher" && method !== "POST")
  )
    return json({ error: "请求方式不支持" }, 405);
  let supabase, backend, users;
  try {
    supabase = origin(env.SUPABASE_URL, ".supabase.co");
    backend = origin(env.AI_BACKEND_ORIGIN, ".vercel.app");
    users = (env.ENGLISHPILOT_ALLOWED_USERS || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (
      !users.length ||
      users.length > 20 ||
      users.some((v) => !/^[a-f0-9-]{36}$/.test(v)) ||
      !env.SUPABASE_PUBLISHABLE_KEY ||
      !env.AI_BACKEND_TOKEN ||
      env.AI_BACKEND_TOKEN.length < 32 ||
      /\s/.test(env.AI_BACKEND_TOKEN)
    )
      throw Error();
  } catch {
    return json(
      {
        error:
          "账号 AI 网关尚未配置，请联系部署者；离线学习和已保存数据仍保留。",
      },
      503,
    );
  }
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer [^\s]{1,8192}$/.test(authorization))
    return json({ error: "请先登录学习账号" }, 401);
  let body;
  try {
    if (method === "POST") {
      if (!request.headers.get("content-type")?.includes("application/json"))
        return json({ error: "只接受 JSON 文字请求" }, 415);
      body = await boundedText(request, 200000);
      const value = JSON.parse(body);
      if (!value || typeof value !== "object" || Array.isArray(value))
        return json({ error: "请求格式不正确" }, 400);
    }
  } catch {
    return json({ error: "请求过大或 JSON 无效" }, 413);
  }
  try {
    const auth = await fetcher(supabase + "/auth/v1/user", {
      method: "GET",
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: authorization,
      },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!auth.ok) return json({ error: "登录已过期，请重新登录" }, 401);
    const user = JSON.parse(await boundedText(auth, 524288));
    if (!users.includes(user.id) || user.is_anonymous === true)
      return json({ error: "此学习账号尚未获准使用私人 AI 服务" }, 403);
    const upstream = await fetcher(backend + url.pathname, {
      method,
      headers: {
        Authorization: `Bearer ${env.AI_BACKEND_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body === undefined ? {} : { body }),
      redirect: "error",
      signal: AbortSignal.timeout(90000),
    });
    if (
      (upstream.status >= 300 && upstream.status < 400) ||
      !upstream.headers
        .get("content-type")
        ?.toLowerCase()
        .includes("application/json")
    )
      throw Error();
    const text = (await boundedText(upstream)).replaceAll(
      env.AI_BACKEND_TOKEN,
      "[redacted]",
    );
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error();
    return json(value, upstream.status);
  } catch {
    return json(
      { error: "在线 AI 连接失败或超时，已保存的学习内容仍保留，请稍后重试。" },
      502,
    );
  }
}
