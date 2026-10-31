/** Shared verbatim with ArkTS; native code must revalidate every RPC request. */
export const HARMONY_BODY_LIMIT: number = 5 * 1024 * 1024;
export const HARMONY_AI_ORIGIN: string =
  "https://englishpilot-chenwl-sync.netlify.app";

export function harmonyRequestAllowed(
  address: string,
  method: string,
): boolean {
  if (typeof address !== "string" || address.length > 8192) return false;
  const match =
    /^https:\/\/([a-z0-9-]+\.supabase\.co|englishpilot-chenwl-sync\.netlify\.app)(\/[^?#\s\\]*)(?:\?[^#\s\\]*)?$/.exec(
      address,
    );
  if (!match) return false;
  const host = match[1],
    path = match[2];
  if (host === "englishpilot-chenwl-sync.netlify.app") {
    return (
      ["GET", "POST"].includes(method) &&
      [
        "/api/evaluate",
        "/api/teacher",
        "/api/configuration",
        "/api/ai-usage",
      ].includes(path)
    );
  }
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

export function harmonyHeaders(
  source: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  let total = 0;
  const names = Object.keys(source);
  if (names.length > 16) throw new Error("请求头超过上限");
  for (const original of names) {
    const name = original.toLowerCase();
    const value = source[original];
    if (
      ![
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
      ].includes(name) ||
      typeof value !== "string" ||
      value.length > 8192 ||
      /[^\x20-\x7e]/.test(value) ||
      Object.keys(result).includes(name)
    )
      throw new Error("不接受此请求头");
    total += name.length + value.length;
    if (total > 32768) throw new Error("请求头超过上限");
    result[name] = value;
  }
  return result;
}
