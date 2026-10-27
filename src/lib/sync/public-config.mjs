/** @param {{url:string,key:string}} value @returns {{url:string,key:string}} */
export function parsePublicSyncConfig(value) {
  if (typeof value?.url !== "string" || typeof value?.key !== "string")
    throw new Error("请配置 Supabase 地址和公开 Key");
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
      /* Invalid tokens fail closed. */
    }
  }
  if (!publicKey)
    throw new Error(
      "这里只接受 publishable/anon 公开 Key，禁止填写 service_role 或 secret Key",
    );
  return { url: url.origin, key };
}
