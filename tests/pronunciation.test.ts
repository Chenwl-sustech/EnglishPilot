import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { speak, stopPronunciation } from "../src/lib/pronunciation";

vi.mock("../src/lib/native/runtime", () => ({ nativeBuild: true }));
vi.mock("../src/lib/local-wav-player", () => ({
  LocalWavEngine: class {
    constructor() {
      throw new Error("Desktop WAV must not be used on iPad");
    }
  },
}));

const localVoice = {
  name: "Samantha",
  lang: "en-US",
  voiceURI: "local-en",
  localService: true,
  default: true,
} as SpeechSynthesisVoice;

class FakeSpeech extends EventTarget {
  voices: SpeechSynthesisVoice[] = [];
  getVoices = vi.fn(() => this.voices);
  speak = vi.fn();
  cancel = vi.fn();
  pause = vi.fn();
  resume = vi.fn();
  ready(voices = [localVoice]) {
    this.voices = voices;
    this.dispatchEvent(new Event("voiceschanged"));
  }
}
let speech: FakeSpeech;
beforeEach(() => {
  vi.useFakeTimers();
  speech = new FakeSpeech();
  vi.stubGlobal("window", { speechSynthesis: speech });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      constructor(public text: string) {}
    },
  );
});
afterEach(async () => {
  stopPronunciation();
  await vi.advanceTimersByTimeAsync(0);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("first pronunciation waits for asynchronously discovered local voices", async () => {
  const error = vi.fn();
  speak("adapt", 1, error);
  expect(error).not.toHaveBeenCalled();
  speech.ready();
  await vi.advanceTimersByTimeAsync(0);
  expect(speech.speak).toHaveBeenCalledTimes(1);
  expect(speech.speak.mock.calls[0][0]).toMatchObject({
    text: "adapt",
    voice: localVoice,
  });
  expect(error).not.toHaveBeenCalled();
});

test("stop before discovery cancels pending playback and discovery listeners", async () => {
  const remove = vi.spyOn(speech, "removeEventListener");
  const error = vi.fn();
  speak("do not play", 1, error);
  stopPronunciation();
  speech.ready();
  await vi.advanceTimersByTimeAsync(5000);
  expect(speech.speak).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledWith("voiceschanged", expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
});

test("a newer pronunciation replaces a pending request", async () => {
  const error = vi.fn();
  speak("old", 1, error);
  speak("new", 1, error);
  speech.ready();
  await vi.advanceTimersByTimeAsync(0);
  expect(speech.speak).toHaveBeenCalledTimes(1);
  expect(speech.speak.mock.calls[0][0].text).toBe("new");
  expect(error).not.toHaveBeenCalled();
});

test("voice discovery times out with useful device instructions and never uses an online voice", async () => {
  const error = vi.fn();
  speech.voices = [
    { ...localVoice, voiceURI: "online-en", localService: false },
  ];
  speak("private study text", 1, error);
  expect(error).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(5000);
  expect(error).toHaveBeenCalledTimes(1);
  expect(error.mock.calls[0][0]).toMatch(/设备|系统|设置/);
  expect(speech.speak).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

test("ready voices play immediately without a discovery timer", () => {
  speech.ready();
  speak("ready", 1, vi.fn());
  expect(speech.speak).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

test("iPad restores a desktop WAV preference using an available local device voice", async () => {
  speech.ready();
  const error = vi.fn();
  expect(() =>
    speak("restored", 1, error, {
      mode: "system-local",
      voiceURI: "windows-desktop-voice",
      locale: "en-GB",
    }),
  ).not.toThrow();
  await vi.advanceTimersByTimeAsync(0);
  expect(speech.speak).toHaveBeenCalledTimes(1);
  expect(error).not.toHaveBeenCalled();
});
