import {
  playbackRates,
  type InstalledVoice,
  type ListeningPlaybackEngine,
  type PlaybackRequest,
} from "../listening";
import {
  createHarmonyRpc,
  harmonyBridge,
  type HarmonyRpc,
} from "./harmony-rpc";

export type HarmonyVoiceStatus = {
  ready: boolean;
  downloadable: boolean;
  downloading: boolean;
  message: string;
};
export function parseHarmonyVoiceStatus(raw: unknown): HarmonyVoiceStatus {
  if (typeof raw !== "string") throw new Error("鸿蒙声音状态无效");
  const value = JSON.parse(raw) as HarmonyVoiceStatus;
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.ready !== "boolean" ||
    typeof value.downloadable !== "boolean" ||
    typeof value.downloading !== "boolean" ||
    typeof value.message !== "string" ||
    value.message.length > 2000
  )
    throw new Error("鸿蒙声音状态无效");
  return value;
}
function speechRpc(): HarmonyRpc {
  const bridge = harmonyBridge();
  if (!bridge) throw new Error("鸿蒙语音接口未就绪");
  return createHarmonyRpc(bridge);
}
export async function harmonyVoiceStatus(): Promise<HarmonyVoiceStatus> {
  const rpc = speechRpc();
  try {
    return parseHarmonyVoiceStatus(await rpc.call("speech:status", []));
  } finally {
    rpc.dispose();
  }
}
export async function downloadHarmonyVoice(): Promise<void> {
  const rpc = speechRpc();
  try {
    if ((await rpc.call("speech:download", [])) !== true)
      throw new Error("声音下载未启动，请刷新后重试");
  } finally {
    rpc.dispose();
  }
}
export async function harmonyEnglishVoices(): Promise<InstalledVoice[]> {
  const status = await harmonyVoiceStatus();
  return [
    ...(status.ready
      ? [
          {
            name: "Laura · 鸿蒙离线英语",
            lang: "en-US",
            voiceURI: "harmony:8",
            localService: true,
            default: true,
          },
        ]
      : []),
    {
      name: "内置英语 · SLT",
      lang: "en-US",
      voiceURI: "harmony:flite-slt",
      localService: true,
      default: !status.ready,
    },
  ];
}

/** Synthesis stays native/offline; WAV playback supports pause and variable speed. */
export class HarmonySpeechEngine implements ListeningPlaybackEngine {
  readonly kind = "local-wav" as const;
  private audio: HTMLAudioElement | null = null;
  private url = "";
  private control: AbortController | null = null;
  private generation = 0;
  private paused = false;
  private attempt = 0;
  private finish: ((error?: Error) => void) | null = null;
  constructor(
    private rpc = speechRpc(),
    private createAudio = () => new Audio(),
  ) {}
  async play(request: PlaybackRequest): Promise<void> {
    this.stop();
    if (
      !playbackRates.includes(request.rate) ||
      !["harmony:8", "harmony:flite-slt"].includes(request.voiceURI)
    )
      throw new Error("鸿蒙英语声音或语速无效");
    const run = ++this.generation;
    const control = new AbortController();
    this.control = control;
    const raw = await this.rpc.call(
      "speech:render",
      [request.text, request.voiceURI],
      control.signal,
    );
    if (run !== this.generation || control.signal.aborted)
      throw new DOMException("播放已停止", "AbortError");
    if (
      typeof raw !== "string" ||
      raw.length > 12 * 1024 * 1024 ||
      !/^[a-zA-Z0-9+/]*={0,2}$/.test(raw)
    )
      throw new Error("鸿蒙音频无效");
    const bytes = Uint8Array.from(atob(raw), (v) => v.charCodeAt(0));
    if (
      new TextDecoder().decode(bytes.slice(0, 4)) !== "RIFF" ||
      new TextDecoder().decode(bytes.slice(8, 12)) !== "WAVE"
    )
      throw new Error("鸿蒙音频格式无效");
    const audio = this.createAudio();
    this.audio = audio;
    const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
    this.url = url;
    audio.src = url;
    audio.playbackRate = request.rate;
    try {
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          audio.onended = null;
          audio.onerror = null;
          if (this.finish === finish) this.finish = null;
          if (error) reject(error);
          else resolve();
        };
        this.finish = finish;
        audio.onended = () => finish();
        audio.onerror = () => finish(new Error("鸿蒙本地声音播放失败，请重试"));
        if (!this.paused) this.start(audio, finish);
      });
    } finally {
      if (this.audio === audio) {
        audio.pause();
        audio.src = "";
        audio.load();
        this.audio = null;
      }
      URL.revokeObjectURL(url);
      if (this.url === url) this.url = "";
    }
  }
  private start(audio: HTMLAudioElement, finish: (error?: Error) => void) {
    const attempt = ++this.attempt;
    void audio.play().catch((error: Error) => {
      if (attempt === this.attempt) finish(error);
    });
  }
  pause() {
    this.attempt++;
    this.paused = true;
    this.audio?.pause();
  }
  resume() {
    this.paused = false;
    if (this.audio && this.finish) this.start(this.audio, this.finish);
  }
  stop() {
    this.generation++;
    this.attempt++;
    this.control?.abort();
    this.control = null;
    this.finish?.(new DOMException("播放已停止", "AbortError"));
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio.load();
      this.audio = null;
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = "";
    this.paused = false;
  }
  dispose() {
    this.stop();
    this.rpc.dispose();
  }
}
