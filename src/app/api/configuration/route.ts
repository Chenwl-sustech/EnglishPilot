import {
  evaluationConfig,
  checkEvaluationConnection,
} from "@/lib/server/evaluation";
import { whisperStatus } from "@/lib/server/whisper";
import { localSpeech } from "@/lib/server/local-tts";
import { sameOrigin } from "@/lib/server/http";
import {
  hostedWhisperMessage,
  isHostedWebDeployment,
} from "../../../lib/server/deployment";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "不接受跨站访问" }, { status: 403 });
  if (isHostedWebDeployment())
    return Response.json(
      {
        app: "EnglishPilot",
        ai: evaluationConfig(),
        whisper: { available: false, error: hostedWhisperMessage },
        tts: {
          available: false,
          message:
            "网页版不提供服务器 Windows 本地 WAV 服务；可使用浏览器检测到的设备本地语音。",
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  const [whisper, tts] = await Promise.allSettled([
    whisperStatus(),
    localSpeech.status(),
  ]);
  const unavailable = (reason: unknown) => ({
    available: false,
    error: reason instanceof Error ? reason.message : "服务检测失败",
  });
  return Response.json(
    {
      app: "EnglishPilot",
      ai: evaluationConfig(),
      whisper:
        whisper.status === "fulfilled"
          ? { ...whisper.value, available: true }
          : unavailable(whisper.reason),
      tts: tts.status === "fulfilled" ? tts.value : unavailable(tts.reason),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "不接受跨站提交" }, { status: 403 });
  try {
    return Response.json(await checkEvaluationConnection());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "AI 连接检测失败" },
      { status: 502 },
    );
  }
}
