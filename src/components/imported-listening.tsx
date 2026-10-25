"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Lesson } from "@/lib/content";
import type { ListeningSentence } from "@/lib/listening";
import type { ListeningMaterial } from "@/lib/listening-material-model";
import {
  listeningAudio,
  submitListeningMaterial,
  updateListeningMaterial,
} from "@/lib/listening-materials";
import { stopPronunciation } from "@/lib/pronunciation";
import { ListeningImportPanel } from "./listening-import";
import { useStudy } from "./study-context";
import { clockText, useStopwatch } from "./use-stopwatch";
import { ListeningTimelineEditor } from "./listening-timeline-editor";
type Mode = "player" | "quiz" | "dictation" | "shadowing";
export type ImportedPracticeRenderer = (
  lesson: Lesson,
  sentence: ListeningSentence,
  mode: "dictation" | "shadowing",
  onCaptureChange: (busy: boolean) => void,
  hasListened: boolean,
) => ReactNode;
export function ImportedListeningLibrary({
  renderPractice,
  onCaptureChange,
  initialId,
  initialMode = "player",
}: {
  renderPractice: ImportedPracticeRenderer;
  onCaptureChange: (busy: boolean) => void;
  initialId?: string;
  initialMode?: Mode;
}) {
  const { state } = useStudy();
  const materials = state.extension.listeningMaterials;
  const [id, setId] = useState(initialId || materials[0]?.id || ""),
    [locked, setLocked] = useState(false);
  const material = materials.find((m) => m.id === id) ?? materials[0];
  function capture(busy: boolean) {
    setLocked(busy);
    onCaptureChange(busy);
  }
  return (
    <>
      <div className="section-line">
        <h2>官方与个人音频</h2>
        <span className="tag">{materials.length} 个本地素材</span>
      </div>
      <ListeningImportPanel onImported={setId} disabled={locked} />
      {material && (
        <>
          <label className="prompt-select">
            导入素材
            <select
              value={material.id}
              disabled={locked}
              onChange={(e) => setId(e.target.value)}
            >
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.exam.toUpperCase()} · {m.title}
                </option>
              ))}
            </select>
          </label>
          <MaterialPractice
            key={`${material.id}:${material.revision}`}
            material={material}
            renderPractice={renderPractice}
            onCaptureChange={capture}
            initialMode={initialMode}
          />
        </>
      )}
      {!material && (
        <p className="muted">
          选择官方目录预览并导入，或添加你有权使用的音频。
        </p>
      )}
    </>
  );
}
function MaterialPractice({
  material: m,
  renderPractice,
  onCaptureChange,
  initialMode,
}: {
  material: ListeningMaterial;
  renderPractice: ImportedPracticeRenderer;
  onCaptureChange: (busy: boolean) => void;
  initialMode: Mode;
}) {
  const { state, update, notify, fail } = useStudy();
  const [url, setUrl] = useState(""),
    [audioError, setAudioError] = useState(""),
    [mode, setMode] = useState<Mode>(initialMode),
    [index, setIndex] = useState(0),
    [loop, setLoop] = useState(false),
    [rate, setRate] = useState(1),
    [hidden, setHidden] = useState(true),
    [locked, setLocked] = useState(false);
  const audio = useRef<HTMLAudioElement>(null),
    bounds = useRef<{ start: number; end: number } | null>(null),
    heard = useRef(false);
  const [listened, setListened] = useState<Set<string>>(() => new Set());
  const playback = useRef({ last: 0, segment: "", seconds: 0 });
  const draftKey = `imported-listening:${m.id}:${m.revision}`;
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(state.drafts[draftKey] ?? "{}");
    } catch {
      return {};
    }
  });
  const [result, setResult] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState(m.transcript),
    [segments, setSegments] = useState(JSON.stringify(m.segments, null, 2)),
    [questions, setQuestions] = useState(JSON.stringify(m.questions, null, 2));
  const clock = useStopwatch(false),
    [attemptId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let active = true,
      u = "";
    void listeningAudio(m.audioId)
      .then((row) => {
        if (!active) return;
        if (!row)
          throw new Error(
            "此素材缺少原音；请重新导入相同音频，或恢复含素材音频的完整备份",
          );
        u = URL.createObjectURL(row.blob);
        setUrl(u);
      })
      .catch((e) => {
        if (active) setAudioError(e.message);
      });
    return () => {
      active = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [m.audioId]);
  useEffect(() => {
    const el = audio.current;
    const pause = () => {
      if (document.hidden) el?.pause();
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      document.removeEventListener("visibilitychange", pause);
      el?.pause();
    };
  }, [url]);
  // Debounced drafts are persisted independently of the later graded attempt.
  useEffect(() => {
    const timer = setTimeout(() => {
      void update(
        (s) => ({
          ...s,
          drafts: {
            ...s.drafts,
            [draftKey]: JSON.stringify(answers),
          },
        }),
        { silent: true },
      ).catch(fail);
    }, 400);
    return () => clearTimeout(timer);
  }, [answers, draftKey, update, fail]);
  function capture(value: boolean) {
    setLocked(value);
    onCaptureChange(value);
  }
  const segment = m.segments[index];
  async function play(part = false) {
    if (!audio.current) return;
    stopPronunciation();
    const end = segment
      ? Math.min(
          segment.end,
          Number.isFinite(audio.current.duration)
            ? audio.current.duration
            : m.duration,
        )
      : 0;
    if (part && segment && segment.start >= end) {
      fail(new Error("片段起点超出可播放范围，请修正时间轴"));
      return;
    }
    bounds.current = part && segment ? { start: segment.start, end } : null;
    audio.current.currentTime = bounds.current?.start ?? 0;
    audio.current.playbackRate = rate;
    try {
      await audio.current.play();
    } catch (e) {
      fail(e);
    }
  }
  async function submit() {
    if (busy || result !== null) return;
    setBusy(true);
    try {
      if (!heard.current) throw new Error("请先播放原音，再保存练习");
      const seconds = clock.elapsed();
      if (seconds < 1) throw new Error("练习不足1秒，请继续练习");
      await update((s) =>
        submitListeningMaterial(
          s,
          m.id,
          attemptId,
          answers,
          seconds,
          new Date(),
          m.revision,
        ),
      );
      clock.pause();
      setResult(
        m.questions.length
          ? "练习正确率已保存；解析见下方。"
          : "本次原音练习已保存，未生成考试分数。",
      );
      notify("实际练习记录已保存");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function edit() {
    if (locked || busy) return;
    setBusy(true);
    try {
      await update((s) =>
        updateListeningMaterial(s, m.id, m.revision, {
          transcript,
          segments: JSON.parse(segments),
          questions: JSON.parse(questions),
        }),
      );
      notify("素材标注已保存");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const last = state.attempts.find((a) => a.id === attemptId);
  const lesson: Lesson = {
    id: m.id,
    title: m.title,
    level: "导入素材",
    category: m.publisher,
    text: m.transcript,
    questions: [],
  };
  return (
    <>
      <section className="panel material-player">
        <h3>{m.title}</h3>
        <p className="small muted">
          {m.origin === "official-sample" ? "官方公开样题" : "个人素材"} ·{" "}
          {m.publisher} · {m.version} · 原音本地播放
        </p>
        <p className="small">
          {m.license}{" "}
          {m.sourceUrl && (
            <a
              className="text-link"
              href={m.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              查看来源
            </a>
          )}
        </p>
        {audioError && <p role="alert">{audioError}</p>}
        {url && (
          <audio
            data-testid="material-player"
            controls
            ref={audio}
            src={url}
            aria-label="导入素材原音"
            onError={() => setAudioError("音频无法解码，请重新导入有效文件")}
            onPlay={() => {
              heard.current = true;
              stopPronunciation();
              if (
                !clock.running &&
                result === null &&
                (mode === "player" || mode === "quiz")
              )
                clock.toggle();
            }}
            onSeeked={() => {
              playback.current = {
                last: audio.current?.currentTime ?? 0,
                segment: segment?.id ?? "",
                seconds: 0,
              };
              const b = bounds.current;
              if (
                b &&
                audio.current &&
                (audio.current.currentTime < b.start ||
                  audio.current.currentTime > b.end)
              )
                bounds.current = null;
            }}
            onTimeUpdate={() => {
              const el = audio.current,
                b = bounds.current;
              if (
                el &&
                segment &&
                !el.paused &&
                el.currentTime >= segment.start &&
                el.currentTime <= segment.end
              ) {
                const previous = playback.current,
                  delta = el.currentTime - previous.last;
                playback.current = {
                  last: el.currentTime,
                  segment: segment.id,
                  seconds:
                    previous.segment === segment.id
                      ? previous.seconds + (delta > 0 && delta < 1 ? delta : 0)
                      : 0,
                };
                if (
                  playback.current.seconds >= 0.15 &&
                  !listened.has(segment.id)
                )
                  setListened((ids) => new Set([...ids, segment.id]));
              }
              if (!el || !b || el.currentTime < b.end) return;
              if (loop) {
                el.currentTime = b.start;
                void el.play().catch(fail);
              } else {
                el.pause();
                el.currentTime = b.end;
              }
            }}
            onEnded={() => {
              const el = audio.current,
                b = bounds.current;
              if (el && b && loop) {
                el.currentTime = b.start;
                void el.play().catch(fail);
              }
            }}
          />
        )}
        <div className="actions">
          <button
            className="button primary"
            disabled={!url}
            onClick={() => void play()}
          >
            整段播放
          </button>
          <button
            className="button secondary"
            onClick={() => audio.current?.pause()}
          >
            暂停原音
          </button>
          <label>
            原音播放速度
            <select
              value={rate}
              onChange={(e) => {
                const v = Number(e.target.value);
                setRate(v);
                if (audio.current) audio.current.playbackRate = v;
              }}
            >
              {[0.75, 0.9, 1, 1.25, 1.5].map((v) => (
                <option key={v} value={v}>
                  {v}×
                </option>
              ))}
            </select>
          </label>
          <span className="small">练习计时 {clockText(clock.seconds)}</span>
          <button
            className="button secondary"
            disabled={result !== null}
            onClick={clock.toggle}
          >
            {clock.running ? "暂停练习计时" : "继续练习计时"}
          </button>
        </div>
        <div className="tabs" aria-label="导入素材训练模式">
          {(
            [
              { id: "player", label: "原音精听" },
              { id: "quiz", label: "题目作答" },
              { id: "dictation", label: "原音听写" },
              { id: "shadowing", label: "原音跟读" },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              disabled={locked}
              className={mode === v.id ? "active" : ""}
              onClick={() => {
                audio.current?.pause();
                if (v.id === "dictation" || v.id === "shadowing") clock.pause();
                setMode(v.id);
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        {mode !== "quiz" && (
          <>
            {segment ? (
              <>
                <label>
                  已标注片段
                  <select
                    disabled={locked}
                    value={index}
                    onChange={(e) => {
                      audio.current?.pause();
                      clock.pause();
                      setIndex(Number(e.target.value));
                    }}
                  >
                    {m.segments.map((s, i) => (
                      <option key={s.id} value={i}>
                        第 {i + 1} 句 · {s.start.toFixed(1)}–{s.end.toFixed(1)}{" "}
                        秒
                      </option>
                    ))}
                  </select>
                </label>
                <div className="actions">
                  <button
                    className="button secondary"
                    disabled={!url}
                    onClick={() => void play(true)}
                  >
                    播放当前片段
                  </button>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={loop}
                      onChange={(e) => setLoop(e.target.checked)}
                    />
                    单句循环
                  </label>
                </div>
              </>
            ) : (
              <p className="small muted">
                尚未标注逐句时间轴。可整段播放；在下方编辑真实起止秒数后启用逐句听写与跟读。
              </p>
            )}
            <button
              className="button secondary"
              onClick={() => setHidden((v) => !v)}
            >
              {hidden ? "显示原文" : "隐藏原文"}
            </button>
            {!hidden && (
              <div className="english-text material-transcript" lang="en">
                {segment?.text ?? (m.transcript || "暂无原文")}
              </div>
            )}
            {!hidden && segment?.translation && <p>{segment.translation}</p>}
          </>
        )}
        {mode === "quiz" && (
          <div>
            {m.questions.length ? (
              m.questions.map((q, i) => (
                <fieldset
                  className="material-question"
                  key={q.id}
                  disabled={busy || result !== null}
                >
                  <legend>
                    {i + 1}. {q.prompt}
                  </legend>
                  <p className="small muted">{q.questionType}</p>
                  {q.kind === "choice" ? (
                    q.options.map((option) => (
                      <label className="answer-option" key={option}>
                        <input
                          type="radio"
                          name={q.id}
                          checked={answers[q.id] === option}
                          onChange={() =>
                            setAnswers((a) => ({ ...a, [q.id]: option }))
                          }
                        />
                        {option}
                      </label>
                    ))
                  ) : (
                    <label>
                      第 {i + 1} 题答案
                      <input
                        maxLength={3000}
                        value={answers[q.id] ?? ""}
                        onChange={(e) =>
                          setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                        }
                      />
                    </label>
                  )}
                  {result !== null && (
                    <p>
                      参考答案：{q.answers.join(" / ")} · {q.explanation}
                    </p>
                  )}
                </fieldset>
              ))
            ) : (
              <p>当前素材没有题目，可在下方添加可核实的题目与答案。</p>
            )}
          </div>
        )}
        {(mode === "quiz" || mode === "player") && (
          <button
            className="button primary"
            disabled={busy || result !== null}
            onClick={() => void submit()}
          >
            提交并保存练习
          </button>
        )}
        {result !== null && (
          <p data-testid="material-result">
            {result}{" "}
            {last?.score !== null && last?.score !== undefined
              ? `${Math.round(last.score * 100)}%`
              : ""}{" "}
            · 客观练习数据，非官方考试成绩
          </p>
        )}
        {locked && (
          <p className="small muted">
            请先保存当前录音，或完成/取消时间轴生成，再切换素材或训练模式。
          </p>
        )}
      </section>
      {segment &&
        (mode === "dictation" || mode === "shadowing") &&
        renderPractice(
          lesson,
          {
            id: `${m.id}:r${m.revision}:${segment.id}`,
            index,
            text: segment.text,
          },
          mode,
          capture,
          listened.has(segment.id),
        )}
      <ListeningTimelineEditor
        material={m}
        disabled={locked || busy}
        onBusyChange={capture}
        onPreview={(start, end) => {
          if (!audio.current) return;
          stopPronunciation();
          bounds.current = { start, end };
          audio.current.currentTime = start;
          audio.current.playbackRate = rate;
          void audio.current.play().catch(fail);
        }}
      />
      <details className="panel material-editor">
        <summary>编辑原文、题目与时间轴</summary>
        <p className="small muted">
          根据实际原音标注秒数，也可使用上方本地生成的草稿。修改会创建新标注版本，已有练习保留原版本。
        </p>
        <fieldset disabled={locked || busy}>
          <label>
            素材原文
            <textarea
              rows={7}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
            />
          </label>
          <label>
            逐句时间轴 JSON
            <textarea
              rows={8}
              value={segments}
              onChange={(e) => setSegments(e.target.value)}
            />
          </label>
          <label>
            题目与答案 JSON
            <textarea
              rows={8}
              value={questions}
              onChange={(e) => setQuestions(e.target.value)}
            />
          </label>
          <button className="button secondary" onClick={() => void edit()}>
            保存素材标注
          </button>
        </fieldset>
      </details>
    </>
  );
}
