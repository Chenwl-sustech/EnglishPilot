import { z } from "zod";
import { respondTeacher } from "../../../lib/server/teacher";
import { TeacherRequestError } from "../../../lib/server/teacher-receipts";
import {
  aiSameOrigin,
  readAiRequest,
  AiRequestError,
} from "../../../lib/server/ai-quota";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!aiSameOrigin(request))
    return Response.json({ error: "不接受跨站提交" }, { status: 403 });
  try {
    return Response.json(
      await respondTeacher(await readAiRequest(request, 200000)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const status =
      e instanceof TeacherRequestError || e instanceof AiRequestError
        ? e.status
        : e instanceof z.ZodError
          ? 400
          : 503;
    const error =
      e instanceof TeacherRequestError || e instanceof AiRequestError
        ? e.message
        : e instanceof z.ZodError
          ? "对话参数无效或历史过长，请检查当前练习"
          : "本机 AI 请求存储不可用，回答和录音仍保留";
    return Response.json(
      { error },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
