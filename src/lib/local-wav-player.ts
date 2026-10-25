import {
  playbackRates,
  type ListeningPlaybackEngine,
  type PlaybackRequest,
} from "./listening";
import { isHostedWebClient } from "./deployment";

/** Only this app's local WAV endpoint is accepted; no online audio fallback. */
export class LocalWavEngine implements ListeningPlaybackEngine {
  readonly kind = "local-wav" as const;
  private audio: HTMLAudioElement | null = null;
  private controller: AbortController | null = null;
  private generation = 0;
  private paused = false;
  private playAttempt = 0;
  private finish: ((error?: Error) => void) | null = null;
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly createAudio = () => new Audio(),
  ) {}
  async play(request: PlaybackRequest): Promise<void> {
    this.stop();
    if (isHostedWebClient)
      throw new Error(
        "网页版无法使用电脑本地 WAV 声音；请在当前设备选择实际可用的设备语音。未上传朗读文本。",
      );
    if (!playbackRates.includes(request.rate)) throw new Error("不支持此语速");
    const run = ++this.generation;
    this.controller = new AbortController();
    const fetcher = this.fetcher;
    const response = await fetcher("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: request.text, voiceId: request.voiceURI }),
      signal: this.controller.signal,
    });
    const result = await response.json();
    if (run !== this.generation)
      throw new DOMException("播放已停止", "AbortError");
    if (!response.ok) throw new Error(result.error ?? "本地 WAV 生成失败");
    if (
      typeof result.url !== "string" ||
      !/^\/api\/tts\?audio=[a-f0-9]{64}$/.test(result.url)
    )
      throw new Error("本地音频地址无效，未切换到外部服务");
    const audio = this.createAudio();
    this.audio = audio;
    audio.src = result.url;
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
        audio.onerror = () =>
          finish(new Error("本地音频播放失败，可重新生成后重试"));
        if (!this.paused) this.startAudio(audio, finish);
      });
    } finally {
      if (this.audio === audio) {
        audio.pause();
        audio.src = "";
        audio.load();
        this.audio = null;
      }
    }
  }
  private startAudio(audio: HTMLAudioElement, finish: (error?: Error) => void) {
    const attempt = ++this.playAttempt;
    void audio.play().catch((error) => {
      if (attempt === this.playAttempt) finish(error);
    });
  }
  pause() {
    this.playAttempt++;
    this.paused = true;
    this.audio?.pause();
  }
  resume() {
    this.paused = false;
    if (this.audio && this.finish) this.startAudio(this.audio, this.finish);
  }
  stop() {
    this.generation++;
    this.playAttempt++;
    this.controller?.abort();
    this.controller = null;
    this.finish?.(new DOMException("播放已停止", "AbortError"));
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio.load();
      this.audio = null;
    }
    this.paused = false;
  }
  dispose() {
    this.stop();
  }
}
