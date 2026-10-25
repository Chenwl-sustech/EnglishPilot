import { z } from "zod";
import {
  AiRequestError,
  aiQuotaLimitsSchema,
  aiSameOrigin,
  getAiQuotaStore,
  readAiRequest,
} from "../../../lib/server/ai-quota";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  if (!aiSameOrigin(request))
    return Response.json({ error: "不接受跨站读取" }, { status: 403, headers });
  try {
    return Response.json(await getAiQuotaStore().snapshot(), { headers });
  } catch {
    return Response.json(
      {
        error:
          "AI 额度记录暂不可用或已损坏；不会自动重置，请稍后重试，或联系管理员检查额度存储。",
      },
      { status: 503, headers },
    );
  }
}

export async function POST(request: Request) {
  if (!aiSameOrigin(request))
    return Response.json({ error: "不接受跨站提交" }, { status: 403, headers });
  try {
    const limits = aiQuotaLimitsSchema.parse(
      await readAiRequest(request, 4096),
    );
    return Response.json(await getAiQuotaStore().configure(limits), {
      headers,
    });
  } catch (error) {
    const status =
      error instanceof AiRequestError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : 503;
    return Response.json(
      {
        error:
          status === 413
            ? "请求过大"
            : status === 400
              ? "额度设置无效，请填写范围内的整数。"
              : "AI 额度保存失败；现有用量不会清零，请稍后重试。",
      },
      { status, headers },
    );
  }
}
