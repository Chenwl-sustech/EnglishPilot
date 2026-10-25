import type { Extension } from "./adaptive-model";
import {
  DeviceSpeechEngine,
  playbackRates,
  type ListeningPlaybackEngine,
  type PlaybackRate,
} from "./listening";
import { LocalWavEngine } from "./local-wav-player";
import { nativeBuild } from "./native/runtime";
import { localEnglishVoices, waitForLocalEnglishVoices } from "./device-voices";
let active: ListeningPlaybackEngine | null = null;
let pending: AbortController | null = null;
export function stopPronunciation() {
  pending?.abort();
  pending = null;
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
  const request = new AbortController();
  pending = request;
  const report = (error: unknown) => {
    if (
      !request.signal.aborted &&
      !(error instanceof DOMException && error.name === "AbortError")
    )
      onError?.(error instanceof Error ? error.message : "发音播放失败");
    if (pending === request) pending = null;
  };
  const play = (engine: ListeningPlaybackEngine, voiceURI: string) => {
    if (request.signal.aborted) {
      engine.dispose();
      return;
    }
    active = engine;
    void engine
      .play({ text, voiceURI, rate: rate as PlaybackRate })
      .catch(report)
      .finally(() => {
        if (active === engine) {
          engine.dispose();
          active = null;
        }
        if (pending === request) pending = null;
      });
  };
  if (preference?.mode === "system-local" && !nativeBuild) {
    if (!preference.voiceURI) {
      report(new Error("请先在设置页选择实际已安装的本地 WAV 声音"));
      return;
    }
    window.speechSynthesis?.cancel();
    play(new LocalWavEngine(), preference.voiceURI);
  } else {
    const speech = window.speechSynthesis;
    if (!speech) {
      report(
        new Error(
          nativeBuild
            ? "设备语音暂不可用，请重启应用后重试。"
            : "浏览器不支持设备语音，可在设置页选择本地 WAV 引擎",
        ),
      );
      return;
    }
    const ready = (voices: SpeechSynthesisVoice[]) => {
      if (request.signal.aborted) return;
      const voice =
        voices.find((v) => v.voiceURI === preference?.voiceURI) ??
        voices.find((v) => v.lang === preference?.locale) ??
        voices[0];
      if (!voice) {
        report(
          new Error(
            nativeBuild
              ? "尚未检测到设备本地英语声音。请在系统设置中下载英语朗读声音后重试；未使用在线语音。"
              : "没有检测到设备本地英语语音，请在设置页选择可用的本地 WAV 声音；未使用在线语音。",
          ),
        );
        return;
      }
      play(new DeviceSpeechEngine(speech), voice.voiceURI);
    };
    const voices = localEnglishVoices(speech);
    if (voices.length) ready(voices);
    else
      void waitForLocalEnglishVoices(speech, request.signal)
        .then(ready)
        .catch(report);
  }
}
