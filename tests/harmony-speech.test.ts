import { expect, test, vi } from "vitest";
import {
  HarmonySpeechEngine,
  parseHarmonyVoiceStatus,
} from "../src/lib/native/harmony-speech";
import type { HarmonyRpc } from "../src/lib/native/harmony-rpc";

test("Harmony voice status never reports malformed or unavailable voices as ready", () => {
  expect(() => parseHarmonyVoiceStatus("{}")).toThrow();
  expect(
    parseHarmonyVoiceStatus(
      JSON.stringify({
        ready: false,
        downloadable: true,
        downloading: false,
        message: "需要下载",
      }),
    ).ready,
  ).toBe(false);
});

test("Harmony WAV playback preserves pause/resume and revokes its audio on completion", async () => {
  const audio = {
    src: "",
    playbackRate: 1,
    onended: null,
    onerror: null,
    pause: vi.fn(),
    play: vi.fn(async () => {}),
    load: vi.fn(),
  };
  const dispose = vi.fn();
  const rpc: HarmonyRpc = {
    call: vi.fn(async () => "UklGRgAAAABXQVZF"),
    dispose,
  };
  const engine = new HarmonySpeechEngine(
    rpc,
    () => audio as unknown as HTMLAudioElement,
  );
  const playing = engine.play({
    text: "Hello",
    voiceURI: "harmony:8",
    rate: 0.75,
  });
  await vi.waitFor(() => expect(audio.play).toHaveBeenCalledTimes(1));
  expect(audio.src).toMatch(/^blob:/);
  expect(audio.playbackRate).toBe(0.75);
  engine.pause();
  expect(audio.pause).toHaveBeenCalled();
  engine.resume();
  expect(audio.play).toHaveBeenCalledTimes(2);
  (audio.onended as unknown as () => void)();
  await playing;
  expect(audio.src).toBe("");
  engine.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});

test("stopping pending Harmony synthesis aborts and prevents late playback", async () => {
  let release: (value: string) => void = () => {};
  let signal: AbortSignal | null | undefined;
  const rpc: HarmonyRpc = {
    call: (_method, _args, passed) => {
      signal = passed;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
    dispose() {},
  };
  const factory = vi.fn();
  const engine = new HarmonySpeechEngine(rpc, factory);
  const pending = engine.play({
    text: "Hello",
    voiceURI: "harmony:8",
    rate: 1,
  });
  engine.stop();
  expect(signal?.aborted).toBe(true);
  release("UklGRgAAAABXQVZF");
  await expect(pending).rejects.toThrow();
  expect(factory).not.toHaveBeenCalled();
  engine.dispose();
});
