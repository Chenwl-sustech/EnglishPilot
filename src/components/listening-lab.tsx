"use client";
import { apiFetch } from "@/lib/native/api";


import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bookmark,
  Headphones,
  Mic,
  Pause,
  Play,
  Plus,
  Save,
  Square,
} from "lucide-react";
import { contentLicense, type Lesson } from "@/lib/content";
import {
  listeningLibrary as listenings,
  lessonLevel,
} from "@/lib/learning-library";
import { StudyLevel } from "./study-level";
import { db } from "@/lib/db";
import { grade, recordAttempt, today } from "@/lib/engine";
import { stateSchema } from "@/lib/model";
import {
  alignDictation,
  DeviceSpeechEngine,
  installedVoiceCatalog,
  playbackRates,
  recordDictation,
  recordShadowingResult,
  splitListeningSentences,
  type DictationAlignment,
  type InstalledVoice,
  type ListeningPlaybackEngine,
  type ListeningSentence,
  type PlaybackRate,
} from "@/lib/listening";
import { useStudy } from "./study-context";
import { clockText, useStopwatch } from "./use-stopwatch";
import { listeningNote } from "@/lib/listening-notes";
import { LocalWavEngine } from "@/lib/local-wav-player";
import { stopPronunciation } from "@/lib/pronunciation";
import { ImportedListeningLibrary } from "./imported-listening";

type Mode = "understanding" | "dictation" | "shadowing";
const modes: { id: Mode; label: string }[] = [
  { id: "understanding", label: "听力理解" },
  { id: "dictation", label: "逐句听写" },
  { id: "shadowing", label: "影子跟读" },
];

export function ListeningLab() {
  return (
    <Suspense fallback={<p role="status">正在打开听力练习…</p>}>
      <ListeningRoute />
    </Suspense>
  );
}

function ListeningRoute() {
  const search = useSearchParams();
  const imported =
    search.get("library") === "imported" ||
    /^listening:[a-f0-9]{64}:/.test(search.get("exercise") ?? "");
  const lessonId =
    (imported
      ? search.get("exercise")
      : listenings.find((lesson) => lesson.id === search.get("exercise"))
          ?.id) ?? listenings[0].id;
  const mode =
    modes.find((item) => item.id === search.get("mode"))?.id ?? "understanding";
  return (
    <ListeningWorkspace
      key={`${lessonId}:${mode}:${search.get("mode")}:${imported}`}
      initialLesson={lessonId}
      initialMode={mode}
      initialLibrary={imported ? "imported" : "original"}
      initialImportedMode={
        search.get("mode") === "listening"
          ? "quiz"
          : search.get("mode") === "dictation"
            ? "dictation"
            : search.get("mode") === "shadowing"
              ? "shadowing"
              : "player"
      }
    />
  );
}

function ListeningWorkspace({
  initialLesson,
  initialMode,
  initialLibrary,
  initialImportedMode,
}: {
  initialLesson: string;
  initialMode: Mode;
  initialLibrary: "original" | "imported";
  initialImportedMode: "player" | "quiz" | "dictation" | "shadowing";
}) {
  const { state } = useStudy();
  const [lessonId, setLessonId] = useState(initialLesson);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [library, setLibrary] = useState(initialLibrary);
  const [captureBusy, setCaptureBusy] = useState(false);
  const lesson =
    listenings.find((item) => item.id === lessonId) ?? listenings[0];
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">LISTEN · RECALL · SPEAK</div>
        <h1>听清一句，再向前一步。</h1>
        <p>原创听力 · 真实设备语音 · 逐句听写与本地影子跟读</p>
      </div>
      <div className="tabs" aria-label="听力素材来源">
        <button
          className={library === "original" ? "active" : ""}
          disabled={captureBusy}
          onClick={() => setLibrary("original")}
        >
          原创课程
        </button>
        <button
          className={library === "imported" ? "active" : ""}
          disabled={captureBusy}
          onClick={() => setLibrary("imported")}
        >
          官方与个人音频
        </button>
      </div>
      {library === "imported" ? (
        <ImportedListeningLibrary
          initialId={initialLesson}
          initialMode={initialImportedMode}
          onCaptureChange={setCaptureBusy}
          renderPractice={(
            importedLesson,
            sentence,
            practice,
            onCaptureChange,
            hasListened,
          ) =>
            practice === "dictation" ? (
              <DictationPanel
                key={sentence.id}
                lesson={importedLesson}
                sentence={sentence}
                hasListened={hasListened}
              />
            ) : (
              <ShadowingPanel
                key={sentence.id}
                lesson={importedLesson}
                sentence={sentence}
                onCaptureChange={onCaptureChange}
              />
            )
          }
        />
      ) : (
        <>
          <StudyLevel />
          <label className="prompt-select">
            选择听力材料
            <select
              value={lesson.id}
              onChange={(event) => setLessonId(event.target.value)}
            >
              {listenings
                .filter(
                  (l) =>
                    l.id === lessonId ||
                    state.extension.studyLevel === "all" ||
                    lessonLevel(l.id, l.level) === state.extension.studyLevel,
                )
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.level} · {item.title}
                  </option>
                ))}
            </select>
          </label>
          <div className="tabs" aria-label="听力练习模式">
            {modes.map((item) => (
              <button
                key={item.id}
                type="button"
                className={mode === item.id ? "active" : ""}
                aria-pressed={mode === item.id}
                onClick={() => setMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <ListeningSession key={lesson.id} lesson={lesson} mode={mode} />
          <p className="small muted content-credit">
            {contentLicense}。设备合成语音为训练示范；题目未作考试分数校准。
          </p>
        </>
      )}
    </>
  );
}

function ListeningSession({ lesson, mode }: { lesson: Lesson; mode: Mode }) {
  const { state, update, notify, fail } = useStudy();
  const sentences = useMemo(
    () => splitListeningSentences(lesson.text, lesson.id),
    [lesson],
  );
  const [index, setIndex] = useState(0);
  const [voices, setVoices] = useState<InstalledVoice[]>([]);
  const [source, setSource] = useState<"browser" | "system">(
    state.extension.voicePreference.mode === "system-local"
      ? "system"
      : "browser",
  );
  const [voiceError, setVoiceError] = useState("");
  const [allowOnline, setAllowOnline] = useState(false);
  const [voiceURI, setVoiceURI] = useState(
    ["device-local", "system-local"].includes(
      state.extension.voicePreference.mode,
    )
      ? state.extension.voicePreference.voiceURI
      : "",
  );
  const [rate, setRate] = useState<PlaybackRate>(1);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [transcript, setTranscript] = useState(false);
  const engine = useRef<ListeningPlaybackEngine | null>(null);
  const generation = useRef(0);
  const repeatCurrent = useRef(false);
  const catalog = installedVoiceCatalog(voices, allowOnline);
  const available = catalog.flatMap((accent) => accent.voices);
  const voice = voiceURI
    ? available.find((item) => item.voiceURI === voiceURI)
    : (available.find(
        (item) =>
          item.lang === state.extension.voicePreference.locale &&
          item.localService,
      ) ??
      available.find((item) => item.default && item.localService) ??
      available.find((item) => item.localService));
  const sentence = sentences[index];

  useEffect(() => {
    let alive = true;
    setVoices([]);
    setVoiceError("");
    const generationRef = generation;
    if (source === "system") {
      const player = new LocalWavEngine();
      engine.current = player;
      void apiFetch("/api/tts")
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok)
            throw new Error(body.error ?? "本地 WAV 引擎不可用");
          if (!alive) return;
          setVoices(
            body.voices.map(
              (v: { id: string; name: string; locale: string }, i: number) => ({
                voiceURI: v.id,
                name: v.name,
                lang: v.locale,
                localService: true,
                default: i === 0,
              }),
            ),
          );
          await update((current) => {
            const preference = current.extension.voicePreference;
            if (
              preference.mode !== "system-local" ||
              preference.voiceURI ||
              !body.voices.length
            )
              return current;
            const selected =
              body.voices.find(
                (v: { locale: string }) => v.locale === preference.locale,
              ) ?? body.voices[0];
            return {
              ...current,
              extension: {
                ...current.extension,
                voicePreference: {
                  mode: "system-local",
                  voiceURI: selected.id,
                  locale: selected.locale,
                },
              },
            };
          });
          if (!body.available) setVoiceError(body.message);
        })
        .catch((error) => {
          if (alive)
            setVoiceError(
              error instanceof Error ? error.message : "本地语音检测失败",
            );
        });
      return () => {
        alive = false;
        generationRef.current++;
        player.dispose();
        engine.current = null;
      };
    }
    if (!("speechSynthesis" in window)) {
      setVoiceError("浏览器不支持设备语音，可选择本地 WAV 引擎。");
      return;
    }
    const speech = window.speechSynthesis;
    const player = new DeviceSpeechEngine(speech);
    engine.current = player;
    const refresh = () => setVoices(speech.getVoices());
    refresh();
    speech.addEventListener("voiceschanged", refresh);
    return () => {
      generationRef.current++;
      speech.removeEventListener("voiceschanged", refresh);
      player.dispose();
      engine.current = null;
    };
  }, [source, update]);

  function stop() {
    generation.current++;
    engine.current?.stop();
    setPlaying(false);
    setPaused(false);
  }

  async function play(fullText = false) {
    stopPronunciation();
    if (!voice || !engine.current) {
      fail(
        new Error(
          "此口音没有可用语音，请安装对应英语语音包或明确选择设备在线语音。",
        ),
      );
      return;
    }
    stop();
    const run = ++generation.current;
    setPlaying(true);
    try {
      let current = fullText ? 0 : index;
      do {
        if (run !== generation.current) break;
        setIndex(current);
        await engine.current.play({
          text: sentences[current].text,
          voiceURI: voice.voiceURI,
          rate,
          allowOnline,
        });
        if (run !== generation.current) break;
        if (!fullText && repeatCurrent.current) continue;
        if (!fullText) break;
        current++;
      } while (current < sentences.length);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        fail(error);
    } finally {
      if (run === generation.current) {
        setPlaying(false);
        setPaused(false);
      }
    }
  }

  async function chooseVoice(uri: string) {
    stop();
    setVoiceURI(uri);
    const selected = available.find((item) => item.voiceURI === uri);
    if (!selected) return;
    try {
      await update((current) => ({
        ...current,
        extension: {
          ...current.extension,
          voicePreference: {
            voiceURI: uri,
            locale: selected.lang,
            mode:
              source === "system"
                ? "system-local"
                : selected.localService
                  ? "device-local"
                  : "device-online",
          },
        },
      }));
    } catch (error) {
      fail(error);
    }
  }

  function collectSelection() {
    const headword = window.getSelection()?.toString().trim();
    if (!headword || headword.length > 120) {
      notify("先在原文中选择一个单词或短语。");
      return;
    }
    window.dispatchEvent(
      new CustomEvent("pilot-collect-word", {
        detail: {
          headword,
          context: sentence.text,
          source: `${lesson.id} · ${lesson.title}`,
        },
      }),
    );
  }

  if (!sentence) return <p>此材料没有可播放的句子。</p>;
  const visible = transcript || mode === "shadowing";
  const favorite = state.extension.favoriteSentences.includes(sentence.id);
  return (
    <>
      <div className="exercise-title">
        <div>
          <div className="eyebrow">
            {lesson.level} · {lesson.category}
          </div>
          <h2>{lesson.title}</h2>
        </div>
        <Headphones size={28} />
      </div>
      <div className="exercise-grid">
        <article className="panel passage">
          <div className="section-line">
            <h3>播放器</h3>
            <span className="tag">
              第 {index + 1} / {sentences.length} 句
            </span>
          </div>
          <label className="prompt-select">
            播放引擎
            <select
              aria-label="听力播放引擎"
              value={source}
              onChange={(event) => {
                stop();
                const next = event.target.value as "browser" | "system";
                setSource(next);
                setVoiceURI("");
                setAllowOnline(false);
                void update((s) => ({
                  ...s,
                  extension: {
                    ...s.extension,
                    voicePreference: {
                      locale: s.extension.voicePreference.locale,
                      voiceURI: "",
                      mode: next === "system" ? "system-local" : "device-local",
                    },
                  },
                })).catch(fail);
              }}
            >
              <option value="browser">浏览器设备语音</option>
              <option value="system">本机系统语音 · WAV 缓存</option>
            </select>
          </label>
          {source === "system" && (
            <p className="small muted">
              已安装的 Windows 系统语音在本机生成
              WAV，重复句子复用有限额缓存。变速只改变播放速度，不改变口音标签。
            </p>
          )}
          {voiceError && (
            <p role="status" className="small muted">
              {voiceError}
            </p>
          )}
          <label className="prompt-select">
            设备语音
            <select
              aria-label="设备英语语音"
              value={voice?.voiceURI ?? ""}
              onChange={(event) => void chooseVoice(event.target.value)}
            >
              <option value="" disabled>
                请选择设备实际可用的语音
              </option>
              {catalog.map((accent) => (
                <optgroup
                  key={accent.locale}
                  label={`${accent.label} · ${accent.locale}`}
                >
                  {accent.available ? (
                    accent.voices.map((item) => (
                      <option key={item.voiceURI} value={item.voiceURI}>
                        {item.name} ·{" "}
                        {item.localService ? "本地" : "设备在线服务"}
                      </option>
                    ))
                  ) : (
                    <option disabled value={`unavailable:${accent.locale}`}>
                      尚无{allowOnline ? "可用" : "本地"}语音
                    </option>
                  )}
                </optgroup>
              ))}
            </select>
          </label>
          {source === "browser" && (
            <label className="small">
              <input
                type="checkbox"
                checked={allowOnline}
                onChange={(event) => {
                  stop();
                  setAllowOnline(event.target.checked);
                  if (!event.target.checked && voice && !voice.localService)
                    setVoiceURI("");
                }}
              />{" "}
              显示设备在线语音（需另外选择后才使用）
            </label>
          )}
          {allowOnline && (
            <p className="small muted">
              选择在线语音后，播放文本会交给操作系统或浏览器的语音服务，可能需要网络。录音仍保存在本设备。
            </p>
          )}
          {!voice && (
            <p role="status" className="small muted">
              此设备尚无可选的对应英语语音。请在系统设置中安装语音包；这里不会用其他口音冒充。
            </p>
          )}
          <div className="actions">
            <button
              type="button"
              className="button primary"
              disabled={!voice}
              onClick={() => void play(true)}
            >
              <Play size={16} />
              播放全文
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={!voice}
              onClick={() => void play()}
            >
              <Play size={16} />
              播放本句
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={!playing}
              onClick={() => {
                if (paused) engine.current?.resume();
                else engine.current?.pause();
                setPaused(!paused);
              }}
            >
              <Pause size={16} />
              {paused ? "继续" : "暂停"}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={!playing}
              onClick={stop}
            >
              <Square size={16} />
              停止
            </button>
          </div>
          <div className="section-line">
            <label>
              语速{" "}
              <select
                aria-label="听力语速"
                value={rate}
                onChange={(event) => {
                  stop();
                  setRate(Number(event.target.value) as PlaybackRate);
                }}
              >
                {playbackRates.map((speed) => (
                  <option key={speed} value={speed}>
                    {speed}×
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={repeat}
                onChange={(event) => {
                  repeatCurrent.current = event.target.checked;
                  setRepeat(event.target.checked);
                }}
              />
              单句循环
            </label>
          </div>
          <div className="actions">
            <button
              className="text-button"
              type="button"
              disabled={index === 0}
              onClick={() => {
                stop();
                setIndex(index - 1);
              }}
            >
              上一句
            </button>
            <button
              className="text-button"
              type="button"
              disabled={index === sentences.length - 1}
              onClick={() => {
                stop();
                setIndex(index + 1);
              }}
            >
              下一句
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setTranscript(!transcript)}
            >
              {visible && mode !== "shadowing" ? "隐藏原文" : "显示原文"}
            </button>
          </div>
          <ol style={{ maxHeight: 280, overflowY: "auto", paddingLeft: 24 }}>
            {sentences.map((item) => (
              <li key={item.id} style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className="text-button"
                  aria-current={index === item.index ? "step" : undefined}
                  onClick={() => {
                    stop();
                    setIndex(item.index);
                  }}
                >
                  {item.index === index ? "▶ " : ""}
                  {visible ? (
                    <span lang="en">{item.text}</span>
                  ) : (
                    `第 ${item.index + 1} 句`
                  )}
                </button>
              </li>
            ))}
          </ol>
          {visible && (
            <div className="actions">
              <button
                type="button"
                className="button secondary compact"
                aria-pressed={favorite}
                onClick={() =>
                  void update((current) => ({
                    ...current,
                    extension: {
                      ...current.extension,
                      favoriteSentences: favorite
                        ? current.extension.favoriteSentences.filter(
                            (id) => id !== sentence.id,
                          )
                        : [
                            ...new Set([
                              ...current.extension.favoriteSentences,
                              sentence.id,
                            ]),
                          ],
                    },
                  })).catch(fail)
                }
              >
                <Bookmark size={15} />
                {favorite ? "已收藏本句" : "收藏本句"}
              </button>
              <button
                type="button"
                className="button secondary compact"
                onClick={collectSelection}
              >
                <Plus size={15} />
                收集所选生词
              </button>
            </div>
          )}
        </article>
        {mode === "understanding" ? (
          <UnderstandingPanel
            key={`understanding:${lesson.id}`}
            lesson={lesson}
          />
        ) : mode === "dictation" ? (
          <DictationPanel
            key={`dictation:${sentence.id}`}
            lesson={lesson}
            sentence={sentence}
          />
        ) : (
          <ShadowingPanel
            key={`shadowing:${sentence.id}`}
            lesson={lesson}
            sentence={sentence}
          />
        )}
      </div>
    </>
  );
}

function UnderstandingPanel({ lesson }: { lesson: Lesson }) {
  const { update, notify, fail } = useStudy();
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useRef("");
  const timer = useStopwatch();
  async function submit() {
    if (busy || result !== null) return;
    setBusy(true);
    try {
      const score = grade(
        answers,
        lesson.questions.map((question) => question.correct),
      );
      id.current ||= crypto.randomUUID();
      await update((current) =>
        recordAttempt(current, {
          id: id.current,
          contentId: lesson.id,
          skill: "listening",
          date: today(),
          createdAt: new Date().toISOString(),
          seconds: timer.elapsed(),
          score,
          answer: JSON.stringify(answers),
          errors: lesson.questions.flatMap((question, index) =>
            answers[index] === question.correct
              ? []
              : [
                  `${question.prompt}；你的答案：${question.options[answers[index]]}；正确答案：${question.options[question.correct]}；${question.explanation}`,
                ],
          ),
        }),
      );
      timer.pause();
      setResult(score);
      notify("听力理解练习已保存。");
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel quiz">
      <div className="section-line">
        <h3>检验理解</h3>
        <span className="timer">{clockText(timer.seconds)}</span>
      </div>
      {lesson.questions.map((question, index) => (
        <fieldset key={question.prompt} disabled={result !== null || busy}>
          <legend>
            {index + 1}. {question.prompt}
          </legend>
          {question.options.map((option, optionIndex) => (
            <label
              key={option}
              className={`answer-option ${answers[index] === optionIndex ? "selected" : ""}`}
            >
              <input
                type="radio"
                name={`${lesson.id}:${index}`}
                checked={answers[index] === optionIndex}
                onChange={() =>
                  setAnswers((current) => {
                    const next = [...current];
                    next[index] = optionIndex;
                    return next;
                  })
                }
              />
              {option}
            </label>
          ))}
          {result !== null && (
            <p className="explanation">
              正确答案：{question.options[question.correct]}
              <br />
              {question.explanation}
            </p>
          )}
        </fieldset>
      ))}
      <button
        type="button"
        className="button primary full"
        disabled={
          busy ||
          result !== null ||
          answers.filter((answer) => answer !== undefined).length !==
            lesson.questions.length
        }
        onClick={() => void submit()}
      >
        提交理解题
      </button>
      {result !== null && (
        <p role="status">
          本次正确率 {Math.round(result * 100)}% · 未换算考试成绩
        </p>
      )}
    </section>
  );
}

function DictationPanel({
  lesson,
  sentence,
  hasListened = true,
}: {
  lesson: Lesson;
  sentence: ListeningSentence;
  hasListened?: boolean;
}) {
  const { update, notify, fail } = useStudy();
  const [response, setResponse] = useState("");
  const [result, setResult] = useState<DictationAlignment | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useRef("");
  const timer = useStopwatch();
  async function submit() {
    if (busy || result) return;
    setBusy(true);
    try {
      const alignment = alignDictation(sentence.text, response);
      id.current ||= crypto.randomUUID();
      const input = {
        id: id.current,
        lessonId: lesson.id,
        sentenceId: sentence.id,
        reference: sentence.text,
        response,
        seconds: timer.elapsed(),
        playedOriginal: hasListened,
        createdAt: new Date().toISOString(),
      };
      await update((current) => recordDictation(current, input));
      setResult(alignment);
      timer.pause();
      notify("听写与逐词错误已保存；WER 仅反映本次转写差异。");
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel quiz">
      <div className="section-line">
        <h3>逐句听写</h3>
        <span className="timer">{clockText(timer.seconds)}</span>
      </div>
      <p className="small muted">
        反复播放本句，写下听到的内容。大小写、标点及常见缩写会先规范化；不会将近义词或相似拼写算作听对。
      </p>
      <label htmlFor="dictation-response">第 {sentence.index + 1} 句听写</label>
      <textarea
        id="dictation-response"
        lang="en"
        autoComplete="off"
        spellCheck={false}
        value={response}
        maxLength={5000}
        disabled={busy || !!result}
        onChange={(event) => setResponse(event.target.value)}
        style={{ width: "100%", minHeight: 140 }}
      />
      <button
        type="button"
        className="button primary"
        disabled={
          busy ||
          !!result ||
          (lesson.id.startsWith("listening:") &&
            (!hasListened || !response.trim() || timer.seconds < 1))
        }
        onClick={() => void submit()}
      >
        检查并保存听写
      </button>
      {lesson.id.startsWith("listening:") && !hasListened && (
        <p className="small muted">请先播放当前原音片段，再保存听写结果。</p>
      )}
      {result && (
        <div role="status">
          <h4>词错误率 WER · {(result.wer * 100).toFixed(1)}%</h4>
          <p className="small muted">
            （替换 + 漏词 + 多词）÷ 原文词数。多词较多时可超过
            100%；这是练习反馈，不是考试成绩。
          </p>
          <p lang="en">
            <strong>原文：</strong>
            {sentence.text}
          </p>
          <p>漏词：{result.missing.join(", ") || "无"}</p>
          <p>中文说明：{listeningNote(lesson.id, sentence.index)}</p>
          <p>
            错词：
            {result.incorrect
              .map((item) => `${item.expected} → ${item.actual}`)
              .join("；") || "无"}
          </p>
          <p>多词：{result.extra.join(", ") || "无"}</p>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setResult(null);
              setResponse("");
              id.current = "";
              timer.reset(true);
            }}
          >
            再练一次
          </button>
        </div>
      )}
    </section>
  );
}

type PendingRecording = {
  id: string;
  recordingId: string;
  blob: Blob;
  seconds: number;
  createdAt: string;
};

function ShadowingPanel({
  lesson,
  sentence,
  onCaptureChange,
}: {
  lesson: Lesson;
  sentence: ListeningSentence;
  onCaptureChange?: (busy: boolean) => void;
}) {
  const { state, update, notify, fail } = useStudy();
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(false);
  const started = useRef(0);
  const stopped = useRef(0);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState(0);
  const [pending, setPending] = useState<PendingRecording | null>(null);
  const captureCallback = useRef(onCaptureChange);
  useEffect(() => {
    captureCallback.current = onCaptureChange;
  }, [onCaptureChange]);
  useEffect(() => {
    captureCallback.current?.(recording || busy || pending !== null);
  }, [recording, busy, pending]);
  useEffect(() => () => captureCallback.current?.(false), []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const current = recorder.current;
      if (current && current.state !== "inactive") current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(
      () =>
        setDuration(Math.floor((performance.now() - started.current) / 1000)),
      250,
    );
    return () => clearInterval(interval);
  }, [recording]);
  async function start() {
    if (busy || recording) return;
    setBusy(true);
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "此浏览器无法录音，请在 localhost 或 HTTPS 下使用支持麦克风的浏览器。",
        );
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const current = new MediaRecorder(
        media,
        mimeType ? { mimeType } : undefined,
      );
      const chunks: Blob[] = [];
      let failed = false;
      current.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      current.onerror = () => {
        failed = true;
        media.getTracks().forEach((track) => track.stop());
        if (alive.current) {
          setRecording(false);
          fail(new Error("录音中断，请检查麦克风后重试。"));
        }
      };
      current.onstop = () => {
        media.getTracks().forEach((track) => track.stop());
        if (!alive.current) return;
        const seconds = Math.max(
          0,
          Math.floor(
            ((stopped.current || performance.now()) - started.current) / 1000,
          ),
        );
        setRecording(false);
        setDuration(seconds);
        if (!failed)
          setPending({
            id: crypto.randomUUID(),
            recordingId: crypto.randomUUID(),
            blob: new Blob(chunks, {
              type: current.mimeType || chunks[0]?.type || "",
            }),
            seconds,
            createdAt: new Date().toISOString(),
          });
      };
      recorder.current = current;
      stopped.current = 0;
      started.current = performance.now();
      current.start();
      setDuration(0);
      setPending(null);
      setRecording(true);
    } catch (error) {
      stream.current?.getTracks().forEach((track) => track.stop());
      if (alive.current) fail(error);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function stop() {
    stopped.current = performance.now();
    if (recorder.current?.state === "recording") recorder.current.stop();
  }
  async function save() {
    if (!pending || busy || !pending.blob.size || pending.seconds < 1) return;
    setBusy(true);
    try {
      await db.transaction("rw", [db.state, db.recordings], async () => {
        const row = await db.state.get("main");
        if (!row) throw new Error("学习状态尚未加载，请刷新后重试。");
        const next = stateSchema.parse(
          recordShadowingResult(row.value, {
            ...pending,
            lessonId: lesson.id,
            sentenceId: sentence.id,
            reference: sentence.text,
          }),
        );
        await db.recordings.put({
          id: pending.recordingId,
          blob: pending.blob,
          date: today(),
          title: `影子跟读 · ${lesson.title} · 第 ${sentence.index + 1} 句`,
        });
        await db.state.put({ id: "main", value: next });
      });
      setPending(null);
      await update((current) => current);
      notify(
        "跟读录音与实际录制时长已保存到本设备；未生成识别文本或发音分数。",
      );
    } catch (error) {
      fail(error);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const history = state.extension.shadowing
    .filter((item) => item.sentenceId === sentence.id)
    .slice(-3)
    .reverse();
  return (
    <section className="panel recorder">
      <h3>影子跟读</h3>
      <p lang="en" className="english-text">
        {sentence.text}
      </p>
      <p className="small muted">
        先听示范，再模仿语音节奏。建议使用耳机，避免录到扬声器声音。
      </p>
      <div className="actions">
        {recording ? (
          <button type="button" className="button danger" onClick={stop}>
            <Square size={16} />
            结束录音 · {clockText(duration)}
          </button>
        ) : (
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => void start()}
          >
            <Mic size={16} />
            开始跟读录音
          </button>
        )}
      </div>
      {recording && <p role="status">● 麦克风录制中 · {duration} 秒</p>}
      {pending && (
        <div className="pending-audio">
          <BlobAudio
            blob={pending.blob}
            filename={`shadowing-${sentence.id}`}
          />
          <p>实际录制时长 {pending.seconds} 秒</p>
          <button
            type="button"
            className="button primary"
            disabled={busy || !pending.blob.size || pending.seconds < 1}
            onClick={() => void save()}
          >
            <Save size={16} />
            保存本次跟读
          </button>
          {pending.seconds < 1 && (
            <p className="small muted">录音不足 1 秒，请重新录制。</p>
          )}
        </div>
      )}
      <p className="small muted">
        录音仅保存到 IndexedDB，JSON
        备份不含音频。离开本句会关闭麦克风。完成表示已提交录音，不代表发音已达标。
      </p>
      <h4>本句录音 · 最近 {history.length} 条</h4>
      {history.length > 0 && (
        <p className="small">
          本句已完成 {history.length} 次跟读 · 本地录音已保存
        </p>
      )}
      {history.map((item) => (
        <StoredRecording key={item.id} recordingId={item.recordingId} />
      ))}
    </section>
  );
}

function StoredRecording({ recordingId }: { recordingId: string }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    void db.recordings
      .get(recordingId)
      .then((recording) => {
        if (active) {
          setBlob(recording?.blob ?? null);
          setUnavailable(!recording);
        }
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, [recordingId]);
  return blob ? (
    <BlobAudio blob={blob} filename={`shadowing-${recordingId}`} />
  ) : (
    <p className="small muted">
      {unavailable
        ? "本设备没有这条音频（JSON 备份不包含音频）。"
        : "正在读取本地录音…"}
    </p>
  );
}

function BlobAudio({ blob, filename }: { blob: Blob; filename: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const value = URL.createObjectURL(blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [blob]);
  return (
    <div>
      <audio
        controls
        src={url || undefined}
        preload="metadata"
        style={{ maxWidth: "100%" }}
      />
      <a
        className="text-button"
        href={url}
        download={`${filename}.${blob.type.includes("mp4") ? "mp4" : "webm"}`}
      >
        下载录音
      </a>
    </div>
  );
}
