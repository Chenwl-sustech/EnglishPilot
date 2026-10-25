export function isHostedWebDeployment() {
  return process.env.ENGLISHPILOT_DEPLOYMENT === "web";
}

export const hostedWhisperMessage =
  "网页版不提供设备本地 Whisper 转写或模型下载。录音保留在当前浏览器，可回放并手工填写文字，不会上传至服务器转写。";

function publicOrigin() {
  const platformHost =
    process.env.VERCEL === "1"
      ? process.env.VERCEL_ENV === "production"
        ? process.env.VERCEL_PROJECT_PRODUCTION_URL
        : process.env.VERCEL_URL
      : undefined;
  const raw =
    process.env.ENGLISHPILOT_PUBLIC_ORIGIN ||
    (platformHost ? `https://${platformHost}` : undefined);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    // Require a canonical HTTPS origin (optionally ending in /). Comparing the
    // raw value also rejects empty ?/# markers and paths normalized by URL.
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (raw === url.origin || raw === `${url.origin}/`)
      ? url
      : null;
  } catch {
    return null;
  }
}

export function hostedSameOrigin(request: Request) {
  const configured = publicOrigin();
  if (!configured) return false;
  const host = request.headers.get("host");
  // Caddy preserves Host, overwrites forwarded protocol, and is the only public
  // entry point. Never infer the public host from arbitrary forwarded headers.
  if (!host || host.toLowerCase() !== configured.host) return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== configured.origin) return false;
  try {
    const protocol = new URL(request.url).protocol;
    return (
      protocol === "https:" ||
      (protocol === "http:" &&
        request.headers.get("x-forwarded-proto") === "https")
    );
  } catch {
    return false;
  }
}
