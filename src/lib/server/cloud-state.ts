import { Redis } from "@upstash/redis";

export interface AtomicCloudTransport {
  get(key: string): Promise<string | null>;
  setOnce(key: string, value: string): Promise<boolean>;
  compareExchange(key: string, before: string, value: string): Promise<number>;
}
const compareScript = `local current=redis.call('GET',KEYS[1])
if not current then return -1 end
if current~=ARGV[1] then return 0 end
redis.call('SET',KEYS[1],ARGV[2]) return 1`;

/** No TTL or implicit reinitialization: quotas and paid-request claims must survive cold starts. */
export class CloudStateStore {
  private transport: AtomicCloudTransport;
  private prefix: string;
  constructor(transport: AtomicCloudTransport, prefix = "englishpilot:v1") {
    this.transport = transport;
    this.prefix = prefix;
    if (!/^[\w:.-]{1,100}$/.test(prefix)) throw new Error("云存储命名空间无效");
  }
  private key(key: string) {
    if (!/^[\w:.-]{1,220}$/.test(key)) throw new Error("云存储记录编号无效");
    return `${this.prefix}:${key}`;
  }
  async read(key: string): Promise<unknown | null> {
    const value = await this.transport.get(this.key(key));
    return value === null ? null : JSON.parse(value);
  }
  async initialize(key: string, value: unknown) {
    return this.transport.setOnce(this.key(key), JSON.stringify(value));
  }
  async completeClaim(key: string, before: unknown, value: unknown) {
    if (
      (await this.transport.compareExchange(
        this.key(key),
        JSON.stringify(before),
        JSON.stringify(value),
      )) !== 1
    )
      throw new Error("云端请求凭据无法安全保存");
  }
  async update<L, T>(
    key: string,
    validate: (raw: unknown) => L,
    change: (value: L) => Promise<T>,
  ): Promise<T> {
    const full = this.key(key);
    for (let attempt = 0; attempt < 24; attempt++) {
      const before = await this.transport.get(full);
      if (before === null)
        throw new Error("云端账本缺失，已停止 AI；请恢复原账本");
      const value = validate(JSON.parse(before)),
        result = await change(value);
      const after = JSON.stringify(validate(value));
      if (after === before) return result;
      const committed = await this.transport.compareExchange(
        full,
        before,
        after,
      );
      if (committed === 1) return result;
      if (committed !== 0) throw new Error("云端账本缺失或提交状态不确定");
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(25, attempt + 1)),
      );
    }
    throw new Error("云端账本繁忙，请稍后重试");
  }
}
export const usesCloudState = () =>
  process.env.VERCEL === "1" || process.env.ENGLISHPILOT_STORAGE === "redis";
export function getCloudStateStore() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token || new URL(url).protocol !== "https:")
    throw new Error("持久化云存储尚未配置，已停止在线写入");
  // No automatic retries of writes with uncertain outcomes.
  const redis = new Redis({
    url,
    token,
    automaticDeserialization: false,
    retry: false,
    signal: () => AbortSignal.timeout(15000),
  });
  return new CloudStateStore(
    {
      get: (key) => redis.get<string>(key),
      setOnce: async (key, value) =>
        (await redis.set(key, value, { nx: true })) === "OK",
      compareExchange: async (key, before, value) => {
        const result = await redis.eval(compareScript, [key], [before, value]);
        if (typeof result !== "number")
          throw new Error("云端原子写入返回值无效");
        return result;
      },
    },
    process.env.ENGLISHPILOT_CLOUD_PREFIX || "englishpilot:v1",
  );
}
