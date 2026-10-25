import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import {
  localSpeech,
  windowsPowerShellPath,
  type SystemVoice,
} from "./local-tts";

export const voicePackLocales = ["en-GB", "en-AU"] as const;
export type VoicePackLocale = (typeof voicePackLocales)[number];
const phaseSchema = z.enum([
  "awaiting-confirmation",
  "preparing",
  "installing-basic",
  "installing-tts",
  "complete",
  "failed",
]);
const operationSchema = z.object({
  id: z.string().uuid(),
  locale: z.enum(voicePackLocales),
  phase: phaseSchema,
  progress: z.number().min(0).max(100),
  message: z.string().max(2000),
  updatedAt: z.string(),
  restartNeeded: z.boolean().optional(),
});
export type VoicePackOperation = z.infer<typeof operationSchema>;
const nativeSchema = z.object({
  capabilities: z.array(
    z.object({
      locale: z.enum(voicePackLocales),
      state: z.string().max(80),
      basicState: z.string().max(80),
      error: z.string().max(2000).optional(),
    }),
  ),
  operation: operationSchema.nullable(),
});
export type NativePackStatus = z.infer<typeof nativeSchema>;
export interface VoicePackDriver {
  platform: NodeJS.Platform;
  inspect(): Promise<NativePackStatus>;
  voices(): Promise<SystemVoice[]>;
  refreshVoices(): Promise<SystemVoice[]>;
  launch(locale: VoicePackLocale, id: string): Promise<void>;
}
const active = (operation: VoicePackOperation | null) =>
  operation !== null && !["complete", "failed"].includes(operation.phase);
export class VoicePackError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export function createVoicePackService(driver: VoicePackDriver) {
  let operation: VoicePackOperation | null = null;
  let reserving = false;
  let refreshedOperation = "";
  async function status() {
    const supported = driver.platform === "win32";
    let native: NativePackStatus = { capabilities: [], operation: null };
    let voices: SystemVoice[] = [];
    let inventoryError = "";
    if (supported) {
      const results = await Promise.allSettled([
        driver.inspect(),
        driver.voices(),
      ]);
      if (results[0].status === "fulfilled") native = results[0].value;
      else
        inventoryError =
          results[0].reason instanceof Error
            ? results[0].reason.message
            : "无法检查 Windows 语音组件";
      if (results[1].status === "fulfilled") voices = results[1].value;
      else
        inventoryError =
          results[1].reason instanceof Error
            ? results[1].reason.message
            : "无法读取真实系统语音";
      if (
        native.operation &&
        (!operation || native.operation.id === operation.id)
      ) {
        // A launcher failure must not be replaced by an older pending disk record.
        if (!(operation?.phase === "failed" && active(native.operation)))
          operation = native.operation;
      }
      if (
        operation?.phase === "complete" &&
        refreshedOperation !== operation.id
      ) {
        voices = await driver.refreshVoices().catch(() => voices);
        refreshedOperation = operation.id;
      }
    }
    const busy = reserving || active(operation);
    return {
      supported,
      adminConfirmationRequired: true,
      source: {
        name: "Microsoft Windows Update · Windows 可选语言组件",
        url: "https://learn.microsoft.com/en-us/windows/deployment/update/optional-content",
        description:
          "从 Microsoft 下载 Basic 与 TextToSpeech 组件；本机合成 WAV，无需付费 AI。",
      },
      operation,
      packs: voicePackLocales.map((locale) => {
        const capability = native.capabilities.find(
          (item) => item.locale === locale,
        );
        const installedVoices = voices.filter(
          (voice) => voice.locale.toLowerCase() === locale.toLowerCase(),
        );
        const usable = installedVoices.length > 0;
        const capabilityState = capability?.state ?? "Unknown";
        const installed =
          usable || capabilityState === "Installed"
            ? true
            : capabilityState === "Unknown"
              ? null
              : false;
        return {
          locale,
          label: locale === "en-GB" ? "英国英语" : "澳大利亚英语",
          capability: `Language.TextToSpeech~~~${locale}~0.0.1.0`,
          basicCapability: `Language.Basic~~~${locale}~0.0.1.0`,
          capabilityState,
          basicState: capability?.basicState ?? "Unknown",
          installed,
          usable,
          status: !supported
            ? "unsupported"
            : usable
              ? "ready"
              : installed
                ? "installed-unavailable"
                : installed === null
                  ? "unknown"
                  : "not-installed",
          voices: installedVoices,
          error: inventoryError || capability?.error || null,
          actions: [
            "refresh",
            ...(supported && !busy && !usable ? ["install"] : []),
            ...(usable ? ["test"] : []),
          ],
        };
      }),
    };
  }
  return {
    status,
    async refresh() {
      if (driver.platform === "win32") await driver.refreshVoices();
      return status();
    },
    async install(rawLocale: string) {
      const locale = z.enum(voicePackLocales).parse(rawLocale);
      if (driver.platform !== "win32")
        throw new VoicePackError("此语音包安装仅支持 Windows", 400);
      if (reserving || active(operation))
        throw new VoicePackError(
          "已有语音包正在安装，请等待完成后再安装另一个",
          409,
        );
      reserving = true;
      try {
        await status();
        if (active(operation))
          throw new VoicePackError(
            "已有语音包正在安装，请等待完成后再安装另一个",
            409,
          );
        const id = randomUUID();
        operation = {
          id,
          locale,
          phase: "awaiting-confirmation",
          progress: 0,
          message:
            "等待 Windows 管理员确认；确认后将从 Windows Update 下载组件。",
          updatedAt: new Date().toISOString(),
        };
        void Promise.resolve()
          .then(() => driver.launch(locale, id))
          .catch((error: unknown) => {
            if (operation?.id === id)
              operation = {
                ...operation,
                phase: "failed",
                message:
                  error instanceof Error
                    ? error.message.slice(0, 2000)
                    : "Windows 安装未启动",
                updatedAt: new Date().toISOString(),
              };
          });
      } finally {
        reserving = false;
      }
      return status();
    },
  };
}
export type VoicePackService = ReturnType<typeof createVoicePackService>;
export type VoicePackStatus = Awaited<ReturnType<VoicePackService["status"]>>;

const command = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("install"), locale: z.enum(voicePackLocales) })
    .strict(),
  z
    .object({
      action: z.literal("refresh"),
      locale: z.enum(voicePackLocales).optional(),
    })
    .strict(),
]);
function originAllowed(request: Request, required: boolean) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const expected = `${url.protocol}//${request.headers.get("host") ?? url.host}`;
  return (
    (origin === null ? !required : origin === expected) &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
}
async function readCommand(request: Request) {
  if (Number(request.headers.get("content-length")) > 2048)
    throw new VoicePackError("请求过大", 413);
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new VoicePackError("请提交 JSON 请求", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new VoicePackError("请求不能为空", 400);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 2048) {
        await reader.cancel();
        throw new VoicePackError("请求过大", 413);
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return command.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}
export function createVoicePackHandlers(service: VoicePackService) {
  return {
    async GET(request: Request) {
      if (!originAllowed(request, false))
        return Response.json({ error: "不接受跨站访问" }, { status: 403 });
      return Response.json(await service.status(), {
        headers: { "Cache-Control": "no-store" },
      });
    },
    async POST(request: Request) {
      if (!originAllowed(request, true))
        return Response.json({ error: "仅接受同源页面提交" }, { status: 403 });
      try {
        const input = await readCommand(request);
        const result =
          input.action === "install"
            ? await service.install(input.locale)
            : await service.refresh();
        return Response.json(result, {
          status: input.action === "install" ? 202 : 200,
          headers: { "Cache-Control": "no-store" },
        });
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof VoicePackError
                ? error.message
                : "语音包请求无效或无法刷新，请检查本机语音服务",
          },
          { status: error instanceof VoicePackError ? error.status : 400 },
        );
      }
    },
  };
}

function runInstaller(
  action: "status" | "launch",
  locale?: VoicePackLocale,
  id?: string,
): Promise<string> {
  return new Promise((resolveResult, reject) => {
    const args = [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      resolve("scripts/install-speech-packs.ps1"),
      "-Action",
      action,
    ];
    if (locale && id) args.push("-Locale", locale, "-JobId", id);
    const child = spawn(windowsPowerShellPath(), args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "",
      diagnostic = "";
    const timer = setTimeout(
      () => {
        child.kill();
        reject(new Error("Windows 语音包检查或管理员确认超时，请刷新状态"));
      },
      action === "launch" ? 300000 : 30000,
    );
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      if (output.length < 64000) output += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      if (diagnostic.length < 4000) diagnostic += chunk;
    });
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("无法启动 Windows PowerShell 5.1 语音包管理"));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolveResult(output.replace(/^\uFEFF/, "").trim());
      else
        reject(
          new Error(
            diagnostic.includes("ADMIN_CANCELLED")
              ? "用户取消了 Windows 管理员确认，未完成安装"
              : "Windows 语音包安装器未能启动，请刷新查看系统错误",
          ),
        );
    });
  });
}
const globalVoicePacks = globalThis as typeof globalThis & {
  englishPilotVoicePacks?: VoicePackService;
};
export const voicePacks = (globalVoicePacks.englishPilotVoicePacks ??=
  createVoicePackService({
    platform: process.platform,
    inspect: async () =>
      nativeSchema.parse(JSON.parse(await runInstaller("status"))),
    voices: async () => (await localSpeech.status()).voices,
    refreshVoices: localSpeech.refreshVoices,
    launch: async (locale, id) => {
      await runInstaller("launch", locale, id);
    },
  }));
