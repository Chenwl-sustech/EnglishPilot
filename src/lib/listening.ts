import { chinaDate } from "./calendar";
import { recordAttempt } from "./engine";
import type { State } from "./model";

export const playbackRates = [0.75, 0.9, 1, 1.25, 1.5] as const;
export type PlaybackRate = (typeof playbackRates)[number];
export type ListeningSentence = { id: string; index: number; text: string };

export function splitListeningSentences(
  text: string,
  lessonId = "listening",
): ListeningSentence[] {
  const segments = new Intl.Segmenter("en", {
    granularity: "sentence",
  }).segment(text);
  const result: string[] = [];
  let pending = "";
  for (const { segment } of segments) {
    pending = `${pending} ${segment}`.replace(/\s+/gu, " ").trim();
    if (
      !pending ||
      /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|e\.g|i\.e)\.$/iu.test(pending)
    )
      continue;
    result.push(pending);
    pending = "";
  }
  if (pending) result.push(pending);
  return result.map((sentence, index) => ({
    id: `${lessonId}:s${index + 1}`,
    index,
    text: sentence,
  }));
}

/** Normalize orthography, not synonyms, stems, or word order. */
export function normalizeDictation(text: string): string[] {
  const tokens =
    text
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .replace(/[‘’]/gu, "'")
      .match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) ?? [];
  const irregular: Record<string, string[]> = {
    "can't": ["can", "not"],
    cannot: ["can", "not"],
    "won't": ["will", "not"],
    "shan't": ["shall", "not"],
    "let's": ["let", "us"],
  };
  return tokens.flatMap((token) => {
    if (irregular[token]) return irregular[token];
    if (token.endsWith("n't")) return [token.slice(0, -3), "not"];
    const suffix = token.match(/^(.+)'(re|ve|ll|m|d)$/u);
    if (suffix)
      return [
        suffix[1],
        { re: "are", ve: "have", ll: "will", m: "am", d: "would" }[suffix[2]]!,
      ];
    if (/^(?:it|he|she|that|there|here|what|who)'s$/u.test(token))
      return [token.slice(0, -2), "is"];
    return [token];
  });
}

export type AlignedWord = {
  type: "correct" | "missing" | "substitution" | "extra";
  expected?: string;
  actual?: string;
};
export type DictationAlignment = {
  referenceTokens: string[];
  responseTokens: string[];
  alignment: AlignedWord[];
  missing: string[];
  incorrect: { expected: string; actual: string }[];
  extra: string[];
  correct: number;
  wordCount: number;
  wer: number;
};

/** Minimum-edit alignment; equal edit costs prefer more exact word matches. */
export function alignDictation(
  reference: string,
  response: string,
): DictationAlignment {
  const expected = normalizeDictation(reference),
    actual = normalizeDictation(response);
  const n = expected.length,
    m = actual.length;
  if ((n + 1) * (m + 1) > 2_000_000 || Math.max(n, m) > 10000)
    throw new Error("文本过长，请逐句听写");
  const costs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  const matches = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  const operations = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) {
    costs[i][0] = i;
    operations[i][0] = 1;
  }
  for (let j = 1; j <= m; j++) {
    costs[0][j] = j;
    operations[0][j] = 2;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const equal = expected[i - 1] === actual[j - 1];
      const candidates = [
        { cost: costs[i - 1][j] + 1, matches: matches[i - 1][j], operation: 1 },
        { cost: costs[i][j - 1] + 1, matches: matches[i][j - 1], operation: 2 },
        {
          cost: costs[i - 1][j - 1] + Number(!equal),
          matches: matches[i - 1][j - 1] + Number(equal),
          operation: 0,
        },
      ];
      const best = candidates.reduce((a, b) =>
        b.cost < a.cost || (b.cost === a.cost && b.matches > a.matches) ? b : a,
      );
      costs[i][j] = best.cost;
      matches[i][j] = best.matches;
      operations[i][j] = best.operation;
    }
  }
  const alignment: AlignedWord[] = [];
  let i = n,
    j = m;
  while (i || j) {
    const operation = operations[i][j];
    if (operation === 1)
      alignment.push({ type: "missing", expected: expected[--i] });
    else if (operation === 2)
      alignment.push({ type: "extra", actual: actual[--j] });
    else {
      const wanted = expected[--i],
        received = actual[--j];
      alignment.push({
        type: wanted === received ? "correct" : "substitution",
        expected: wanted,
        actual: received,
      });
    }
  }
  alignment.reverse();
  return {
    referenceTokens: expected,
    responseTokens: actual,
    alignment,
    missing: alignment
      .filter((word) => word.type === "missing")
      .map((word) => word.expected!),
    incorrect: alignment
      .filter((word) => word.type === "substitution")
      .map((word) => ({ expected: word.expected!, actual: word.actual! })),
    extra: alignment
      .filter((word) => word.type === "extra")
      .map((word) => word.actual!),
    correct: matches[n][m],
    wordCount: n,
    wer: costs[n][m] / Math.max(1, n),
  };
}

export type InstalledVoice = Pick<
  SpeechSynthesisVoice,
  "name" | "lang" | "voiceURI" | "localService" | "default"
>;
export type VoiceAccent = {
  locale: string;
  label: string;
  voices: InstalledVoice[];
  available: boolean;
};

export function installedVoiceCatalog(
  voices: readonly InstalledVoice[],
  allowOnline = false,
): VoiceAccent[] {
  return [
    { locale: "en-GB", label: "英国英语" },
    { locale: "en-US", label: "美国英语" },
    { locale: "en-AU", label: "澳大利亚英语" },
  ].map((accent) => {
    const matching = voices.filter((voice) => {
      const language = voice.lang
        .replace(/_/gu, "-")
        .toLocaleLowerCase("en-US");
      const locale = accent.locale.toLocaleLowerCase("en-US");
      return (
        (allowOnline || voice.localService) &&
        (language === locale || language.startsWith(`${locale}-`))
      );
    });
    return { ...accent, voices: matching, available: matching.length > 0 };
  });
}

export type PlaybackRequest = {
  text: string;
  voiceURI: string;
  rate: PlaybackRate;
  allowOnline?: boolean;
};
export interface ListeningPlaybackEngine {
  readonly kind: "device-speech" | "local-wav";
  play(request: PlaybackRequest): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  dispose(): void;
}
/** Future model engines can use this contract; Windows system WAV uses a bounded server disk cache. */
export interface LocalWavCache {
  get(request: {
    text: string;
    voice: string;
    locale: string;
    rate: PlaybackRate;
  }): Promise<Blob | null>;
  put(
    request: {
      text: string;
      voice: string;
      locale: string;
      rate: PlaybackRate;
    },
    wav: Blob,
  ): Promise<void>;
}

export class DeviceSpeechEngine implements ListeningPlaybackEngine {
  readonly kind = "device-speech" as const;
  private cancelPending: (() => void) | null = null;
  constructor(private readonly speech: SpeechSynthesis) {}
  play(request: PlaybackRequest): Promise<void> {
    this.stop();
    if (!playbackRates.includes(request.rate))
      return Promise.reject(new Error("不支持此语速"));
    const voice = this.speech
      .getVoices()
      .find((candidate) => candidate.voiceURI === request.voiceURI);
    if (!voice || (!voice.localService && !request.allowOnline))
      return Promise.reject(
        new Error("所选语音不可用，请选择设备已安装的英语语音"),
      );
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(request.text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = request.rate;
      const finish = (error?: Error) => {
        utterance.onend = null;
        utterance.onerror = null;
        this.cancelPending = null;
        if (error) reject(error);
        else resolve();
      };
      this.cancelPending = () =>
        finish(new DOMException("播放已停止", "AbortError"));
      utterance.onend = () => finish();
      utterance.onerror = (event) =>
        finish(
          event.error === "canceled" || event.error === "interrupted"
            ? new DOMException("播放已停止", "AbortError")
            : new Error(`设备语音播放失败：${event.error}`),
        );
      this.speech.speak(utterance);
    });
  }
  pause() {
    this.speech.pause();
  }
  resume() {
    this.speech.resume();
  }
  stop() {
    this.cancelPending?.();
    this.speech.cancel();
  }
  dispose() {
    this.stop();
  }
}

export type ListeningSubmission = {
  id: string;
  lessonId: string;
  sentenceId: string;
  reference: string;
  seconds: number;
  createdAt: string;
};
export type DictationSubmission = ListeningSubmission & {
  response: string;
  playedOriginal?: boolean;
};
export type ShadowingSubmission = ListeningSubmission & { recordingId: string };

export function recordDictation(
  state: State,
  input: DictationSubmission,
): State {
  if (state.extension.dictations.some((item) => item.id === input.id))
    return state;
  const imported = input.lessonId.startsWith("listening:");
  if (
    imported &&
    (!input.playedOriginal || !input.response.trim() || input.seconds < 1)
  )
    throw new Error(
      "请先播放当前原音片段，填写听写并进行至少1秒练习，再保存结果",
    );
  const result = alignDictation(input.reference, input.response);
  const errors = [
    ...(result.missing.length
      ? [`Missing Words · 漏词：${result.missing.join(", ")}`]
      : []),
    ...(result.incorrect.length
      ? [
          `Incorrect Words · 错词：${result.incorrect.map((word) => `${word.expected} → ${word.actual}`).join("; ")}`,
        ]
      : []),
    ...(result.extra.length
      ? [`Extra Words · 多词：${result.extra.join(", ")}`]
      : []),
  ];
  const next = recordAttempt(state, {
    id: input.id,
    skill: "listening",
    ...(imported ? { activity: "dictation" as const } : {}),
    contentId: input.lessonId,
    date: chinaDate(new Date(input.createdAt)),
    createdAt: input.createdAt,
    seconds: input.seconds,
    score: null,
    answer: input.response,
    errors: errors.map(
      (error) =>
        `${error}\n原句：${input.reference}\n你的答案：${input.response}\n正确答案：${input.reference}\n解析：${error}`,
    ),
  });
  return {
    ...next,
    extension: {
      ...next.extension,
      dictations: [
        ...next.extension.dictations,
        {
          id: input.id,
          attemptId: input.id,
          sentenceId: input.sentenceId,
          reference: input.reference,
          response: input.response,
          wer: result.wer,
          missing: result.missing,
          incorrect: result.incorrect,
          extra: result.extra,
          createdAt: input.createdAt,
        },
      ],
    },
  };
}

export function recordShadowingResult(
  state: State,
  input: ShadowingSubmission,
): State {
  if (state.extension.shadowing.some((item) => item.id === input.id))
    return state;
  const next = recordAttempt(state, {
    id: input.id,
    skill: "speaking",
    ...(input.lessonId.startsWith("listening:")
      ? { activity: "shadowing" as const }
      : {}),
    contentId: input.lessonId,
    date: chinaDate(new Date(input.createdAt)),
    createdAt: input.createdAt,
    seconds: input.seconds,
    score: null,
    answer: `本地影子跟读录音：${input.reference}`,
    errors: [],
  });
  return {
    ...next,
    extension: {
      ...next.extension,
      shadowing: [
        ...next.extension.shadowing,
        {
          id: input.id,
          recordingId: input.recordingId,
          sentenceId: input.sentenceId,
          reference: input.reference,
          createdAt: input.createdAt,
          completed: true,
          transcript: null,
        },
      ],
    },
  };
}
