import type { AtomicCloudTransport } from "../shared/server/cloud-state";

export type Env = Record<string, string | undefined>;
export const compareScript = `local current=redis.call('GET',KEYS[1])
if not current then return -1 end
if current~=ARGV[1] then return 0 end
redis.call('SET',KEYS[1],ARGV[2]) return 1`;

export function redisAddress(env: Env) {
  const raw = env.UPSTASH_REDIS_REST_URL;
  if (!raw) throw new Error("免费云数据库尚未配置。");
  const url = new URL(raw);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".upstash.io") || url.port || url.username || url.password || url.search || url.hash || (raw !== url.origin && raw !== url.origin + "/"))
    throw new Error("请使用 Upstash 控制台提供的 HTTPS REST 地址。");
  if (!env.UPSTASH_REDIS_REST_TOKEN || /\s/u.test(env.UPSTASH_REDIS_REST_TOKEN))
    throw new Error("免费云数据库访问凭据尚未配置。");
  return url.origin;
}

export function createRedisClient(env: Env, fetcher: typeof fetch = fetch) {
  const origin = redisAddress(env);
  return async (command: (string | number)[]): Promise<unknown> => {
    try {
      const response = await fetcher(origin, {
        method: "POST", redirect: "error",
        headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(command), signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error();
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      let text = "", bytes = 0;
      const decoder = new TextDecoder("utf-8", { fatal: true });
      try {
        while (true) {
          const next = await reader.read(); if (next.done) break;
          bytes += next.value.byteLength;
          if (bytes > 4 * 1024 * 1024) throw new Error();
          text += decoder.decode(next.value, { stream: true });
        }
        text += decoder.decode();
      } catch (error) { void reader.cancel().catch(() => {}); throw error; }
      finally { reader.releaseLock(); }
      const value = JSON.parse(text);
      if (!value || typeof value !== "object" || Array.isArray(value) || value.error || !("result" in value)) throw new Error();
      return value.result;
    } catch {
      throw new Error("免费云数据库暂不可用或已到额度；请检查控制台，现有额度不会自动重置。");
    }
  };
}

export function createUpstashTransport(env: Env, fetcher: typeof fetch = fetch): AtomicCloudTransport {
  const command = createRedisClient(env, fetcher);
  return {
    async get(key) {
      const result = await command(["GET", key]);
      if (result !== null && typeof result !== "string") throw new Error("云数据库返回了无效状态。");
      return result;
    },
    async setOnce(key, value) {
      const result = await command(["SET", key, value, "NX"]);
      if (result !== null && result !== "OK") throw new Error("云数据库初始化结果不确定。");
      return result === "OK";
    },
    async compareExchange(key, before, value) {
      const result = await command(["EVAL", compareScript, 1, key, before, value]);
      if (![0, 1, -1].includes(result as number)) throw new Error("云数据库原子写入结果不确定。");
      return result as number;
    },
  };
}
