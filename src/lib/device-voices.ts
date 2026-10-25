export function localEnglishVoices(
  speech: SpeechSynthesis,
): SpeechSynthesisVoice[] {
  return speech
    .getVoices()
    .filter((voice) => voice.localService && /^en(?:[-_]|$)/i.test(voice.lang));
}

/** WebKit can return an empty catalog until its first voiceschanged event. */
export function waitForLocalEnglishVoices(
  speech: SpeechSynthesis,
  signal: AbortSignal,
  timeoutMs = 2000,
): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      speech.removeEventListener("voiceschanged", refresh);
      signal.removeEventListener("abort", abort);
    };
    const finish = (voices: SpeechSynthesisVoice[]) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(voices);
    };
    const abort = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new DOMException("播放已停止", "AbortError"));
    };
    const refresh = () => {
      const voices = localEnglishVoices(speech);
      if (voices.length) finish(voices);
    };
    if (signal.aborted) {
      abort();
      return;
    }
    // Listen before querying again so discovery between the caller's initial
    // query and this subscription cannot leave the request waiting forever.
    speech.addEventListener("voiceschanged", refresh);
    signal.addEventListener("abort", abort, { once: true });
    refresh();
    if (!finished)
      timer = setTimeout(() => finish(localEnglishVoices(speech)), timeoutMs);
  });
}
