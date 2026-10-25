import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  utimes,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

export type SystemVoice = { id: string; name: string; locale: string };
export interface SpeechDriver {
  name: string;
  voices(refresh?: boolean): Promise<SystemVoice[]>;
  synthesize(
    input: { text: string; voiceId: string },
    output: string,
  ): Promise<void>;
}
const inputSchema = z.object({
  text: z.string().trim().min(1).max(8000),
  voiceId: z.string().min(1).max(256),
});
const audioKey = z.string().regex(/^[a-f0-9]{64}$/);
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function validWav(bytes: Buffer) {
  return (
    bytes.length > 44 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WAVE"
  );
}

export function createLocalSpeechService({
  directory,
  driver,
  maxFiles = 200,
  maxBytes = 128 * 1024 * 1024,
}: {
  directory: string;
  driver: SpeechDriver;
  maxFiles?: number;
  maxBytes?: number;
}) {
  const root = resolve(directory);
  const pending = new Map<
    string,
    Promise<{ key: string; cached: boolean; bytes: number }>
  >();
  let maintenance: Promise<void> = Promise.resolve();
  const maintain = (operation: () => Promise<void>) => {
    const next = maintenance.then(operation);
    maintenance = next.catch(() => {});
    return next;
  };
  async function files() {
    await mkdir(root, { recursive: true });
    const names = (await readdir(root)).filter((name) =>
      /^[a-f0-9]{64}\.wav$/.test(name),
    );
    const entries = await Promise.all(
      names.map(async (name) => {
        const info = await stat(join(root, name)).catch(() => null);
        return info?.isFile()
          ? { name, bytes: info.size, time: info.mtimeMs }
          : null;
      }),
    );
    return entries.filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null,
    );
  }
  async function prune(protect?: string) {
    return maintain(async () => {
      const entries = (await files()).sort((a, b) => a.time - b.time);
      let total = entries.reduce((sum, f) => sum + f.bytes, 0),
        count = entries.length;
      for (const file of entries) {
        if (count <= maxFiles && total <= maxBytes) break;
        if (file.name === `${protect}.wav`) continue;
        await unlink(join(root, file.name)).catch(() => {});
        count--;
        total -= file.bytes;
      }
    });
  }
  async function audio(key: string) {
    audioKey.parse(key);
    const path = join(root, `${key}.wav`);
    const bytes = await readFile(path);
    if (!validWav(bytes)) throw new Error("本地语音缓存损坏，请重新生成");
    const now = new Date();
    await utimes(path, now, now).catch(() => {});
    return bytes;
  }
  async function generate(raw: unknown) {
    const input = inputSchema.parse(raw);
    if (!(await driver.voices()).some((v) => v.id === input.voiceId))
      throw new Error("所选本地语音不可用，请选择实际已安装的声音");
    const key = hash(
      JSON.stringify([
        "englishpilot-wav-v1",
        driver.name,
        input.voiceId,
        input.text,
      ]),
    );
    const active = pending.get(key);
    if (active) return active;
    const work = (async () => {
      await mkdir(root, { recursive: true });
      try {
        const saved = await audio(key);
        return { key, cached: true, bytes: saved.length };
      } catch {
        /* A missing or invalid file must be regenerated. */
      }
      const temporary = join(root, `${key}.${randomUUID()}.tmp.wav`);
      try {
        await driver.synthesize(input, temporary);
        const bytes = await readFile(temporary);
        if (!validWav(bytes) || bytes.length > maxBytes)
          throw new Error("本地引擎没有生成有效或大小合适的 WAV 音频");
        await rename(temporary, join(root, `${key}.wav`));
        await prune(key);
        return { key, cached: false, bytes: bytes.length };
      } finally {
        await unlink(temporary).catch(() => {});
      }
    })();
    pending.set(key, work);
    try {
      return await work;
    } finally {
      pending.delete(key);
    }
  }
  return {
    generate,
    audio,
    refreshVoices: () => driver.voices(true),
    async status() {
      const voices = await driver.voices();
      const entries = await files();
      return {
        engine: driver.name,
        localOnly: true,
        available: voices.length > 0,
        voices,
        cache: {
          files: entries.length,
          bytes: entries.reduce((n, f) => n + f.bytes, 0),
          maxFiles,
          maxBytes,
        },
        message: voices.length
          ? "使用此电脑已安装的系统语音生成本地 WAV；文本不上传。"
          : "当前没有可用的本地 WAV 英语语音。Windows 需安装系统语音包；其他系统暂可使用浏览器设备语音。",
      };
    },
    async clear() {
      if (pending.size) throw new Error("语音正在生成，请完成后再清理缓存");
      await maintain(async () => {
        if (pending.size) throw new Error("语音正在生成，请完成后再清理缓存");
        for (const file of await files())
          await unlink(join(root, file.name)).catch(() => {});
      });
      return { cleared: true };
    },
  };
}

function sapi(
  action: "voices" | "synthesize",
  input?: unknown,
): Promise<string> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      windowsPowerShellPath(),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        resolve("scripts/system-speech.ps1"),
        "-Action",
        action,
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "",
      diagnostic = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      diagnostic += chunk;
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("本地系统语音生成超时，请缩短文本后重试"));
    }, 45000);
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("无法启动 Windows 本地语音引擎"));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolveResult(output.replace(/^\uFEFF/, "").trim());
      else
        reject(
          new Error(
            diagnostic.includes("VOICE_UNAVAILABLE")
              ? "所选本地语音不可用"
              : "Windows 本地语音引擎失败，请检查系统英语语音包",
          ),
        );
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input ? JSON.stringify(input) : "");
  });
}
// WinRT speech requires Windows PowerShell 5.1, rather than a PATH alias to pwsh.
export function windowsPowerShellPath() {
  return join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}
export function createSystemSpeechDriver({
  platform = process.platform,
  run = sapi,
}: {
  platform?: NodeJS.Platform;
  run?: (action: "voices" | "synthesize", input?: unknown) => Promise<string>;
} = {}): SpeechDriver {
  const tokens = new Map<string, string>();
  let cached: SystemVoice[] | undefined,
    checkedAt = 0;
  return {
    // Preserve the cache namespace and hashed SAPI token IDs from earlier versions.
    name: platform === "win32" ? "windows-sapi" : "unavailable",
    async voices(refresh = false) {
      if (platform !== "win32") return [];
      if (!refresh && cached && Date.now() - checkedAt < 15000) return cached;
      const raw = z
        .array(
          z.object({ id: z.string(), name: z.string(), locale: z.string() }),
        )
        .parse(JSON.parse(await run("voices")));
      tokens.clear();
      cached = raw
        .filter((v) => /^en-/i.test(v.locale))
        .map((v) => {
          const id = hash(v.id);
          tokens.set(id, v.id);
          return { id, name: v.name, locale: v.locale };
        });
      checkedAt = Date.now();
      return cached;
    },
    async synthesize(input, output) {
      const token = tokens.get(input.voiceId);
      if (!token) throw new Error("所选本地语音不可用");
      await run("synthesize", { text: input.text, voiceId: token, output });
    },
  };
}
export const localSpeech = createLocalSpeechService({
  directory: resolve(".local/tts"),
  driver: createSystemSpeechDriver(),
});
