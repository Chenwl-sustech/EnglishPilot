import type { Extension } from "./adaptive-model";
import {
  DeviceSpeechEngine,
  playbackRates,
  type ListeningPlaybackEngine,
  type PlaybackRate,
} from "./listening";
import { LocalWavEngine } from "./local-wav-player";
let active: ListeningPlaybackEngine | null = null;
export function stopPronunciation() {
  active?.dispose();
  active = null;
}
export function speak(
  text: string,
  rate = 1,
  onError?: (message: string) => void,
  preference?: Extension["voicePreference"],
) {
  stopPronunciation();
  if (!playbackRates.includes(rate as PlaybackRate)) {
    onError?.("不支持此语速");
    return;
  }
  let voiceId: string, engine: ListeningPlaybackEngine;
  if (preference?.mode === "system-local") {
    if (!preference.voiceURI) {
      onError?.("请先在设置页选择实际已安装的本地 WAV 声音");
      return;
    }
    window.speechSynthesis?.cancel();
    voiceId = preference.voiceURI;
    engine = new LocalWavEngine();
  } else {
    const speech = window.speechSynthesis;
    if (!speech) {
      onError?.("浏览器不支持设备语音，可在设置页选择本地 WAV 引擎");
      return;
    }
    const voices = speech
      .getVoices()
      .filter((v) => v.localService && /^en[-_]/i.test(v.lang));
    const voice =
      voices.find((v) => v.voiceURI === preference?.voiceURI) ?? voices[0];
    if (!voice) {
      onError?.(
        "没有检测到设备本地英语语音，请在设置页选择可用的本地 WAV 声音；未使用在线语音。",
      );
      return;
    }
    voiceId = voice.voiceURI;
    engine = new DeviceSpeechEngine(speech);
  }
  active = engine;
  void engine
    .play({ text, voiceURI: voiceId, rate: rate as PlaybackRate })
    .catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        onError?.(error instanceof Error ? error.message : "发音播放失败");
    })
    .finally(() => {
      if (active === engine) {
        engine.dispose();
        active = null;
      }
    });
}
