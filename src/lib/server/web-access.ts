import { createHash, timingSafeEqual } from "node:crypto";

/** Protect the independently hosted app; Docker retains its existing Caddy access boundary. */
export function webAccessResponse(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): Response | null {
  if (env.VERCEL !== "1" && env.ENGLISHPILOT_REQUIRE_ACCESS !== "1")
    return null;
  const expected = env.ENGLISHPILOT_ACCESS_HASH;
  const headers = {
    "Cache-Control": "no-store",
    "WWW-Authenticate": 'Basic realm="EnglishPilot", charset="UTF-8"',
  };
  if (!expected || !/^[a-f0-9]{64}$/.test(expected))
    return new Response("应用访问保护尚未配置", { status: 503, headers });
  const auth = request.headers.get("Authorization") ?? "";
  if (auth.length <= 8192 && /^Basic [A-Za-z0-9+/]+={0,2}$/.test(auth)) {
    const supplied = createHash("sha256")
      .update(Buffer.from(auth.slice(6), "base64"))
      .digest();
    if (timingSafeEqual(supplied, Buffer.from(expected, "hex"))) return null;
  }
  return new Response("请输入 EnglishPilot 访问用户名和密码", {
    status: 401,
    headers,
  });
}
