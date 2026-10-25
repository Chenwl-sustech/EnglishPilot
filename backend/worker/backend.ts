import { z } from "zod";
import { evaluate, evaluationConfig, checkEvaluationConnection } from "../shared/server/evaluation";
import { respondTeacher } from "../shared/server/teacher";
import { TeacherReceipts, TeacherRequestError } from "../shared/server/teacher-receipts";
import { CloudStateStore } from "../shared/server/cloud-state";
import { AiQuotaStore, aiQuotaLimitsSchema, QuotaExceededError, QuotaStorageError, AiRequestError, readAiRequest } from "../shared/server/ai-quota";

export function d1Transport(db: any) {
  return {
    async get(key: string): Promise<string | null> {
      const row = await db.prepare("SELECT value FROM state WHERE key = ?").bind(key).first();
      return row?.value ?? null;
    },
    async setOnce(key: string, value: string) {
      const result = await db.prepare("INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING").bind(key, value).run();
      return result.meta.changes === 1;
    },
    async compareExchange(key: string, before: string, value: string) {
      const result = await db.prepare("UPDATE state SET value = ? WHERE key = ? AND value = ?").bind(value, key, before).run();
      if (result.meta.changes === 1) return 1;
      return (await this.get(key)) === null ? -1 : 0;
    },
  };
}

async function matches(value: string, expected: string | undefined) {
  if (!expected || expected.length < 24 || value.length > 8192) return false;
  const hash = (s: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  const [a, b] = await Promise.all([hash(value), hash(expected)]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  return left.reduce((diff, v, i) => diff | (v ^ right[i]), 0) === 0;
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export async function accessResponse(request: Request, env: Record<string, any>) {
  if (!await matches(request.headers.get("Authorization") ?? "", `Bearer ${env.BACKEND_ACCESS_TOKEN ?? ""}`) || !env.BACKEND_ACCESS_TOKEN)
    return json({ error: "设备连接未获授权，请检查安装版连接配置。" }, 401);
  if (request.headers.has("Origin")) return json({ error: "此接口仅接受已配对安装版请求。" }, 403);
  return null;
}

export function createBackend({ fetcher = fetch, cloudFactory }: { fetcher?: typeof fetch; cloudFactory?: (env: Record<string, any>) => CloudStateStore } = {}) {
  return {
    async fetch(request: Request, env: Record<string, any>) {
      const denied = await accessResponse(request, env);
      if (denied) return denied;
      const path = new URL(request.url).pathname;
      const method = request.method;
      const config = { ...env, ENGLISHPILOT_DEPLOYMENT: "web" };
      const cloud = cloudFactory ? cloudFactory(env) : new CloudStateStore(d1Transport(env.DB));
      const quota = new AiQuotaStore({ directory: "/", cloud });
      const receipts = new TeacherReceipts("/", () => cloud);
      const providerFetch: typeof fetch = async (input, init) => {
        try { return await fetcher(input, init); }
        catch (error) {
          const message = error instanceof Error ? error.message : "unknown";
          console.warn(JSON.stringify({ event: "provider_transport_failure", name: error instanceof Error ? error.name : "unknown", message: message.replaceAll(String(env.OPENAI_API_KEY || "__no_key__"), "[secret]").slice(0, 250) }));
          throw error;
        }
      };
      try {
        if (path === "/api/evaluate" && method === "GET") return json(evaluationConfig(config));
        if (path === "/api/configuration" && method === "GET") return json({
          app: "EnglishPilot", backend: new URL(request.url).origin,
          ai: evaluationConfig(config),
          whisper: { available: false, error: "安装版使用设备录音与手工核对文字；录音不上传。" },
          tts: { available: false, message: "朗读使用设备已安装的语音。" },
        });
        if (path === "/api/configuration" && method === "POST") return json(await checkEvaluationConnection(config, providerFetch));
        if (path === "/api/ai-usage" && method === "GET") return json(await quota.snapshot());
        if (path === "/api/ai-usage" && method === "POST") return json(await quota.configure(aiQuotaLimitsSchema.parse(await readAiRequest(request, 4096))));
        if (path === "/api/evaluate" && method === "POST") return json(await evaluate(await readAiRequest(request, 100000), config, providerFetch, quota));
        if (path === "/api/teacher" && method === "POST") return json(await respondTeacher(await readAiRequest(request, 200000), { env: config, fetcher: providerFetch, quota, receipts }));
        // Explicit one-time operator bootstrap; never initialize a missing ledger during study calls.
        if (path === "/api/bootstrap" && method === "POST") {
          if (!await matches(request.headers.get("X-Setup-Token") ?? "", env.BACKEND_SETUP_TOKEN)) return json({error: "初始化未获授权"}, 403);
          const created = await cloud.initialize("ai-usage", { version: 1, limits: { dailyCalls: 20, dailyTokens: 200000, maxOutputTokens: 4096 }, days: {} });
          return json({ created, message: created ? "额度账本已初始化" : "已有账本，未修改" });
        }
        return json({ error: "接口不存在" }, 404);
      } catch (error) {
        const status = error instanceof QuotaExceededError ? 429 : error instanceof AiRequestError ? error.status : error instanceof z.ZodError ? 400 : error instanceof TeacherRequestError ? error.status : error instanceof QuotaStorageError ? 503 : 502;
        const message = error instanceof z.ZodError ? "请求格式不正确，请检查输入。" : error instanceof Error ? error.message : "AI 服务暂不可用，已保存的学习内容仍保留。";
        return json({ error: message }, status);
      }
    },
  };
}

export default createBackend();
