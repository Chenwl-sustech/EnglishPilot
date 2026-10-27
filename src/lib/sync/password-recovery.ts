import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import { parseSyncConfig, type SyncConfig } from "./config";
import { sessionStorageKey } from "./session-storage";

/** A separate PKCE client: only expiring verifiers survive a new browser tab. */
export function createPasswordRecovery(
  raw: SyncConfig,
  persistent: SupportedStorage,
  fetcher: typeof fetch = fetch,
  now = Date.now,
) {
  const config = parseSyncConfig(raw);
  const key = sessionStorageKey(config.url) + "-password-recovery";
  const memory = new Map<string, string>();
  const verifier = (name: string) =>
    name.startsWith(key + "-") && name.endsWith("-code-verifier");
  const storage: SupportedStorage = {
    async getItem(name) {
      if (!verifier(name)) return memory.get(name) ?? null;
      try {
        const item = JSON.parse((await persistent.getItem(name)) ?? "null");
        if (item && typeof item.value === "string" && item.expires > now())
          return item.value;
      } catch {
        /* An unreadable verifier cannot authorize recovery. */
      }
      await persistent.removeItem(name);
      return null;
    },
    async setItem(name, value) {
      if (verifier(name))
        await persistent.setItem(
          name,
          JSON.stringify({ value, expires: now() + 3600000 }),
        );
      else memory.set(name, value);
    },
    async removeItem(name) {
      if (verifier(name)) await persistent.removeItem(name);
      else memory.delete(name);
    },
  };
  const client = createClient(config.url, config.key, {
    auth: {
      storageKey: key,
      storage,
      flowType: "pkce",
      detectSessionInUrl: false,
      autoRefreshToken: false,
      persistSession: true,
    },
    global: {
      fetch: (input, init) =>
        fetcher(input, {
          ...init,
          redirect: "error",
          signal: AbortSignal.timeout(30000),
        }),
    },
  });
  let grant: { uid: string; expires: number } | null = null;
  let requestNotBefore = 0;
  const retryAfterSeconds = () =>
    Math.max(0, Math.ceil((requestNotBefore - now()) / 1000));
  async function clearSession() {
    grant = null;
    try {
      await client.auth.signOut({ scope: "local" });
    } catch {
      /* Local memory is cleared even if logout is unavailable. */
    }
    memory.clear();
  }
  return {
    retryAfterSeconds,
    async request(email: string, origin: string) {
      const address = email.trim(),
        target = new URL(origin);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 320)
        throw Error("请填写有效的学习账号邮箱");
      if (
        target.protocol !== "https:" ||
        target.username ||
        target.password ||
        target.pathname !== "/" ||
        target.search ||
        target.hash
      )
        throw Error("请在 HTTPS 学习网页请求重设邮件");
      if (retryAfterSeconds())
        throw Error(`请等待 ${retryAfterSeconds()} 秒后再请求重设邮件`);
      await clearSession();
      const { error } = await client.auth.resetPasswordForEmail(address, {
        redirectTo: target.origin + "/reset-password/",
      });
      if (error) {
        if (error.status === 429) requestNotBefore = now() + 60000;
        if (error.code === "over_email_send_rate_limit")
          throw Error(
            "邮件发送已达云服务频率上限。请先查看收件箱和垃圾邮件中的最新重设邮件，等待额度恢复后再申请；倒计时仅为请求间隔，不代表云端额度已恢复。",
          );
        if (error.code === "over_request_rate_limit")
          throw Error("请求过于频繁，请等待片刻后再试，不要连续发送邮件");
        if (error.code === "email_address_not_authorized")
          throw Error(
            "此云项目的默认邮件仅支持项目成员邮箱。请使用部署者已创建的学习账号邮箱；其他邮箱需由部署者配置邮件服务。",
          );
        if (
          error.name === "AuthRetryableFetchError" ||
          error.code === "request_timeout"
        )
          throw Error("暂时无法连接账号云服务，请检查网络后再试");
        throw Error("重设邮件请求失败。请稍后重试，或联系部署者检查邮件服务。");
      }
      requestNotBefore = now() + 60000;
    },
    async consume(
      rawUrl: string,
      clearUrl: () => void,
    ): Promise<string | null> {
      grant = null;
      const url = new URL(rawUrl);
      clearUrl(); // Remove the one-use code before any request, error UI or navigation.
      if (
        url.hash ||
        url.searchParams.has("error") ||
        url.searchParams.has("error_code")
      )
        throw Error("重设链接无效或已过期，请重新请求邮件");
      const codes = url.searchParams.getAll("code"),
        flows = url.searchParams.getAll("sb_flow_id");
      if (!codes.length) return null;
      if (
        codes.length !== 1 ||
        !/^[A-Za-z0-9_-]{1,2048}$/.test(codes[0]) ||
        flows.length > 1 ||
        (flows.length && !/^[a-f0-9]{32}$/i.test(flows[0]))
      )
        throw Error("重设链接格式无效，请重新请求邮件");
      const { data, error } = await client.auth.exchangeCodeForSession(
        codes[0],
        flows.length ? { flowId: flows[0] } : undefined,
      );
      if (
        error ||
        !("redirectType" in data) ||
        data.redirectType !== "recovery" ||
        !data.user?.id ||
        !data.session
      ) {
        await clearSession();
        throw Error(
          "无法验证重设链接。请在发起请求的同一浏览器打开邮件链接；链接过期时请重新请求。",
        );
      }
      grant = { uid: data.user.id, expires: now() + 600000 };
      return data.user.email ?? "当前学习账号";
    },
    async finish(password: string, confirmation: string) {
      if (!grant || grant.expires <= now()) {
        await clearSession();
        throw Error("请先验证有效的重设邮件链接");
      }
      if (password.length < 8 || password.length > 128)
        throw Error("新密码须为 8–128 位");
      if (password !== confirmation) throw Error("两次输入的新密码不一致");
      const { data, error } = await client.auth.updateUser({ password });
      if (error) throw Error("密码更新失败，请检查密码要求或重新请求重设邮件");
      if (data.user?.id !== grant.uid) {
        await clearSession();
        throw Error("重设账号校验失败，请重新请求邮件");
      }
      await clearSession();
    },
  };
}
