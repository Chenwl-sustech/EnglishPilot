import { afterEach, expect, test, vi } from "vitest";
import { usePronunciationCleanup } from "../src/components/use-pronunciation-cleanup";
import { speak, stopPronunciation } from "../src/lib/pronunciation";

const effects = vi.hoisted(() => [] as Array<() => void | (() => void)>);
vi.mock("react", () => ({
  useEffect: (effect: () => void | (() => void)) => effects.push(effect),
}));
vi.mock("../src/lib/native/runtime", () => ({ nativeBuild: true }));

afterEach(() => {
  stopPronunciation();
  effects.length = 0;
  vi.unstubAllGlobals();
});

test("leaving a pronunciation scope prevents a cold word from playing on the next page", async () => {
  const catalog = new EventTarget();
  let voices: SpeechSynthesisVoice[] = [];
  const speech = Object.assign(catalog, {
    getVoices: () => voices,
    cancel: vi.fn(),
    speak: vi.fn(),
  });
  vi.stubGlobal("window", { speechSynthesis: speech });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      constructor(public text: string) {}
    },
  );
  usePronunciationCleanup("reading");
  const leave = effects[0]();
  speak("word from closed dialog", 1, vi.fn());
  expect(typeof leave).toBe("function");
  leave!();
  voices = [
    {
      name: "Samantha",
      lang: "en-US",
      voiceURI: "local-en",
      localService: true,
    },
  ] as SpeechSynthesisVoice[];
  speech.dispatchEvent(new Event("voiceschanged"));
  await Promise.resolve();
  expect(speech.speak).not.toHaveBeenCalled();
  speak("current page", 1, vi.fn());
  expect(speech.speak).toHaveBeenCalledTimes(1);
});
