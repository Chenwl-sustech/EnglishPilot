export type SyncConfig = { url: string; key: string };
export const syncConfigKey = "englishpilot-sync-config-v1";
export function parseSyncConfig(value: {
  url: string;
  key: string;
}): SyncConfig {
  const url = new URL(value.url.trim());
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)
  )
    throw new Error("请输入 Supabase 项目的 HTTPS 根地址");
  const key = value.key.trim();
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key);
  if (!publicKey && key.length < 5000 && key.split(".").length === 3) {
    try {
      const part = key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      publicKey = JSON.parse(atob(part)).role === "anon";
    } catch {
      /* Never accept admin tokens or arbitrary secrets. */
    }
  }
  if (!publicKey)
    throw new Error(
      "这里只接受 publishable/anon 公开 Key，禁止填写 service_role 或 secret Key",
    );
  return { url: url.origin, key };
}
export function readSyncConfig(): SyncConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(syncConfigKey);
    if (raw) return parseSyncConfig(JSON.parse(raw));
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )
      return parseSyncConfig({
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      });
  } catch {
    /* Invalid or incomplete configuration never enables uploads. */
  }
  return null;
}
