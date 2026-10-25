import { createBackend, accessResponse } from "../worker/backend";
import { CloudStateStore } from "../shared/server/cloud-state";
import { aiQuotaLimitsSchema, AiRequestError, readAiRequest } from "../shared/server/ai-quota";
import { createUpstashTransport, type Env } from "./redis";

export const FREE_LIMITS = { dailyCalls: 20, dailyTokens: 200000, maxOutputTokens: 4096 };
export const freeLimitsSchema = aiQuotaLimitsSchema.refine(v => v.dailyCalls <= FREE_LIMITS.dailyCalls && v.dailyTokens <= FREE_LIMITS.dailyTokens && v.maxOutputTokens <= FREE_LIMITS.maxOutputTokens);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export function createFreeService({ env, fetcher = fetch }: { env: Env; fetcher?: typeof fetch }) {
  const config = { ...env, OPENAI_API_KEY: env.DEEPSEEK_API_KEY, OPENAI_BASE_URL: "https://api.deepseek.com", OPENAI_MODEL: "deepseek-flash", OPENAI_REASONING_EFFORT: "none" };
  const backend = createBackend({ fetcher, cloudFactory: () => new CloudStateStore(createUpstashTransport(env, fetcher), env.ENGLISHPILOT_CLOUD_PREFIX || "englishpilot:free:v1") });
  return {
    async fetch(request: Request) {
      const path = new URL(request.url).pathname;
      if (path === "/api/health" && request.method === "GET")
        return json({ app: "EnglishPilot", mode: "free-cloud", status: "runtime-only", requiresMac: false });
      const denied = await accessResponse(request, config);
      if (denied) return denied;
      if (path === "/api/bootstrap") return json({ error: "请通过受保护的迁移脚本初始化数据库。" }, 404);
      try {
        if (path === "/api/ai-usage" && request.method === "POST") {
          const input = await readAiRequest(request.clone(), 4096);
          if (!freeLimitsSchema.safeParse(input).success)
            return json({ error: "免费方案最多每日20次、200000 token、单次4096输出；可降低额度或暂停AI。" }, 400);
        }
        return await backend.fetch(request, config);
      } catch (error) {
        return json({ error: error instanceof AiRequestError ? error.message : "免费云后端配置或存储暂不可用，请检查部署配置；学习内容仍保留。" }, error instanceof AiRequestError ? error.status : 503);
      }
    },
  };
}
