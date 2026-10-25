import { localSpeech } from "@/lib/server/local-tts";
import { sameOrigin } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "不接受跨站访问" }, { status: 403 });
  const key = new URL(request.url).searchParams.get("audio");
  try {
    if (key)
      return new Response(new Uint8Array(await localSpeech.audio(key)), {
        headers: {
          "Content-Type": "audio/wav",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    return Response.json(await localSpeech.status());
  } catch (error) {
    return Response.json(
      {
        error: key
          ? "音频不存在或缓存不可用，请重新生成"
          : error instanceof Error
            ? error.message
            : "本地语音不可用",
      },
      { status: key ? 404 : 503 },
    );
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "不接受跨站提交" }, { status: 403 });
  try {
    const text = await request.text();
    if (text.length > 40000)
      return Response.json({ error: "语音文本过长" }, { status: 413 });
    const input = JSON.parse(text);
    if (input.action === "clear-cache")
      return Response.json(await localSpeech.clear());
    const result = await localSpeech.generate(input);
    return Response.json({
      ...result,
      url: `/api/tts?audio=${result.key}`,
      localOnly: true,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "本地语音生成失败" },
      { status: 400 },
    );
  }
}
