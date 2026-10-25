import {
  evaluate,
  evaluationConfig,
  evaluationInput,
} from "../../../lib/server/evaluation";
import { z } from "zod";
import {
  AiRequestError,
  QuotaExceededError,
  QuotaStorageError,
  aiSameOrigin,
  readAiRequest,
} from "../../../lib/server/ai-quota";
export const runtime = "nodejs";
export async function GET() {
  return Response.json(evaluationConfig());
}
export async function POST(request: Request) {
  if (!aiSameOrigin(request))
    return Response.json({ error: "不接受跨站提交" }, { status: 403 });
  try {
    const input = evaluationInput.parse(await readAiRequest(request, 100000));
    const result = await evaluate(input);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "AI 评价失败" },
      {
        status:
          error instanceof QuotaExceededError
            ? 429
            : error instanceof QuotaStorageError
              ? 503
              : error instanceof AiRequestError
                ? error.status
                : error instanceof z.ZodError
                  ? 400
                  : evaluationConfig().configured
                    ? 502
                    : 503,
      },
    );
  }
}
