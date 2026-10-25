import {
  whisperStatus,
  downloadLocalModel,
  transcribeLocal,
} from "@/lib/server/whisper";
import { sameOrigin } from "@/lib/server/http";
import {
  hostedWhisperMessage,
  isHostedWebDeployment,
} from "../../../lib/server/deployment";
export const runtime = "nodejs";
export async function GET() {
  if (isHostedWebDeployment())
    return Response.json(
      { available: false, error: hostedWhisperMessage },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  try {
    return Response.json(await whisperStatus());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "本地服务不可用" },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  if (isHostedWebDeployment())
    return Response.json(
      { available: false, error: hostedWhisperMessage },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  if (!sameOrigin(request))
    return Response.json({ error: "不接受跨站提交" }, { status: 403 });
  try {
    if (Number(request.headers.get("content-length")) > 30000000)
      return Response.json({ error: "音频上限 30 MB" }, { status: 413 });
    const name = new URL(request.url).searchParams.get("model") ?? "tiny";
    if (request.headers.get("content-type")?.startsWith("application/json")) {
      const input = await request.json();
      return Response.json(
        await downloadLocalModel(name, input.confirmed === true),
      );
    }
    return Response.json(
      await transcribeLocal(
        new Uint8Array(await request.arrayBuffer()),
        name,
        request.headers.get("content-type") ?? "",
      ),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "转写失败" },
      { status: 502 },
    );
  }
}
