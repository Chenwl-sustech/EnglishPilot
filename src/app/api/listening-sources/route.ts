import { z } from "zod";
import { officialListeningCatalog } from "../../../lib/data/official-listening";
import { officialListeningStore } from "../../../lib/server/listening-sources";
import { sameOrigin } from "../../../lib/server/http";
import { readAiRequest, AiRequestError } from "../../../lib/server/ai-quota";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "不接受跨站读取" }, { status: 403, headers });
  try {
    const id = new URL(request.url).searchParams.get("id");
    return Response.json(
      id
        ? await officialListeningStore.metadata(id)
        : { sources: officialListeningCatalog },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "素材不存在或配套标注不可用，请检查官方目录" },
      { status: 400, headers },
    );
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "不接受跨站提交" }, { status: 403, headers });
  try {
    const input = z
      .object({
        id: z.string().min(1).max(100),
        force: z.boolean().default(false),
      })
      .strict()
      .parse(await readAiRequest(request, 2048));
    const result = await officialListeningStore.download(input.id, input.force);
    return new Response(new Uint8Array(result.bytes), {
      headers: {
        ...headers,
        "Content-Type": "audio/mpeg",
        "Content-Length": String(result.bytes.length),
        "X-EnglishPilot-Source": input.id,
        "X-EnglishPilot-Cached": String(result.cached),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof z.ZodError
            ? "请选择有效的官方素材"
            : e instanceof Error
              ? e.message
              : "下载失败，未修改学习数据",
      },
      {
        status:
          e instanceof AiRequestError
            ? e.status
            : e instanceof z.ZodError
              ? 400
              : 502,
        headers,
      },
    );
  }
}
