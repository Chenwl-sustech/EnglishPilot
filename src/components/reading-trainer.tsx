"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  Pause,
  Play,
} from "lucide-react";
import { useStudy } from "./study-context";
import { PageHeading } from "./exercises";
import { clockText } from "./use-stopwatch";
import { contentLicense } from "@/lib/content";
import {StudyLevel} from "./study-level";
import {lessonLevel} from "@/lib/learning-library";
import {
  ReadingSessionClock,
  commitReadingAttempt,
  disputeReadingQuestion,
  readingLessons,
  readingStatistics,
  readingTypeLabel,
  readingWordCount,
  selectedReadingWord,
  type ReadingExam,
  type ReadingLesson,
  type ReadingSnapshot,
  type ReadingWordSelection,
  type TimingPolicy,
} from "@/lib/reading";

const examNames: Record<ReadingExam, string> = {
  shared: "共同基础",
  ielts: "IELTS",
  toefl: "TOEFL",
};
const time = (seconds: number) => clockText(Math.floor(seconds));

export type ReadingTrainerProps = {
  onCollectWord?: (selection: ReadingWordSelection) => void | Promise<void>;
};

export function ReadingTrainer({ onCollectWord }: ReadingTrainerProps) {
  const { state, update, fail } = useStudy();
  const [active, setActive] = useState<ReadingLesson | null>(null);
  const [exam, setExam] = useState<ReadingExam | "all">("all");
  const [policy, setPolicy] = useState<TimingPolicy>(
    state.extension.timingPolicy,
  );
  const stats = readingStatistics(state);
  useEffect(() => { if (active) window.scrollTo({ top: 0, behavior: "instant" }); }, [active?.id]);
  const lessons = readingLessons.filter(
    (lesson) => (exam === "all" || lesson.exam === exam)&&(state.extension.studyLevel==="all"||lessonLevel(lesson.id,lesson.level)===state.extension.studyLevel),
  );

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "exercise",
    );
    const lesson = readingLessons.find(
      (candidate) => candidate.id === requested,
    );
    if (lesson) setActive(lesson);
  }, []);

  if (active)
    return (
      <ReadingExercise
        key={active.id}
        lesson={active}
        timingPolicy={policy}
        onBack={() => setActive(null)}
        onCollectWord={onCollectWord}
      />
    );

  return (
    <>
      <PageHeading
        eyebrow="READING · BUILD UNDERSTANDING"
        title="读懂文字，也读懂世界。"
        description={`${readingLessons.length} 组原创阅读与题型训练 · 分级筛选、逐题计时、检查理解和原文依据。`}
      />
      <StudyLevel/>
      <div className="section-line">
        <label className="prompt-select">
          材料分类
          <select
            aria-label="阅读材料分类"
            value={exam}
            onChange={(event) =>
              setExam(event.target.value as ReadingExam | "all")
            }
          >
            <option value="all">全部阅读</option>
            <option value="shared">共同基础</option>
            <option value="ielts">IELTS 题型示例</option>
            <option value="toefl">TOEFL 题型示例</option>
          </select>
        </label>
        <label className="prompt-select">
          后台计时策略
          <select
            aria-label="阅读后台计时策略"
            value={policy}
            onChange={(event) => {
              const next = event.target.value as TimingPolicy;
              setPolicy(next);
              void update((current) => ({
                ...current,
                extension: { ...current.extension, timingPolicy: next },
              })).catch(fail);
            }}
          >
            <option value="pause-hidden">切到后台自动暂停</option>
            <option value="continue-hidden">后台继续计时</option>
          </select>
        </label>
      </div>
      <p className="small muted">
        进入材料后开始阅读计时。作答时只累计当前题；可暂停、切题、回到原文。同一题多次访问会累加有效时间。
      </p>
      {stats.sessions > 0 && (
        <section className="panel" aria-label="阅读表现统计">
          <div className="section-line">
            <h2>你的阅读证据</h2>
            <span className="tag">
              {stats.sessions} 次提交 · {stats.questions} 个有效逐题样本
            </span>
          </div>
          <p>
            理解正确率{" "}
            {stats.accuracy === null
              ? "暂无"
              : `${Math.round(stats.accuracy * 100)}%`}{" "}
            · 平均每题{" "}
            {stats.meanQuestionSeconds === null
              ? "暂无"
              : `${stats.meanQuestionSeconds.toFixed(1)} 秒`}{" "}
            · 阅读阶段 {time(stats.readingSeconds)} · 作答阶段{" "}
            {time(stats.answerSeconds)}
          </p>
          <p>
            {stats.wordsPerMinute === null
              ? "阅读速度：暂缺有效阅读阶段样本"
              : `阅读速度观察：${Math.round(stats.wordsPerMinute)} 词/分钟 · ${stats.speedSamples} 个样本`}
          </p>
          <p className="small muted">
            速度按原文字数 ÷ 阅读阶段时间计算；每个阅读阶段至少 5
            秒才计入。阶段由你切换，不能证明每个词均已读完，需结合正确率判断。样本不用于推算考试成绩。
          </p>
          {stats.groups.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>考试 / 题型</th>
                    <th>难度参考</th>
                    <th>样本</th>
                    <th>正确率</th>
                    <th>平均有效耗时</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.groups.map((group) => (
                    <tr
                      key={`${group.exam}:${group.questionType}:${group.difficulty}`}
                    >
                      <td>
                        {examNames[group.exam]} ·{" "}
                        {readingTypeLabel(group.questionType)}
                      </td>
                      <td>{group.difficulty}</td>
                      <td>{group.samples}</td>
                      <td>{Math.round(group.accuracy * 100)}%</td>
                      <td>{group.meanSeconds.toFixed(1)} 秒</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {stats.disputedQuestions > 0 && (
            <p className="small muted">
              {stats.disputedQuestions}{" "}
              个争议题次暂不纳入正确率和题型耗时统计；原始作答保留。
            </p>
          )}
        </section>
      )}
      <div className="section-line">
        <span>{lessons.length} 个学习单元</span>
        <span className="small muted">原创学习示例 · 难度未校准</span>
      </div>
      <div className="lesson-grid">
        {lessons.map((lesson, index) => {
          const attempts = state.attempts.filter(
            (attempt) => attempt.contentId === lesson.id,
          );
          return (
            <article className="panel lesson-card" key={lesson.id}>
              <div className="lesson-icon reading">
                <BookOpen size={24} />
                <span>UNIT {String(index + 1).padStart(2, "0")}</span>
              </div>
              <div className="tags">
                <span>{lesson.level} · 难度参考</span>
                <span>{examNames[lesson.exam]}</span>
              </div>
              <h2 lang="en">{lesson.title}</h2>
              <p>{lesson.text.slice(0, 105)}…</p>
              <p className="small muted">
                {[...new Set(lesson.questions.map((q) => q.typeLabel))].join(
                  " · ",
                )}
              </p>
              <div className="lesson-footer">
                <small className="muted">
                  {attempts.length
                    ? `已练习 ${attempts.length} 次`
                    : `${lesson.questions.length} 道理解题`}{" "}
                  · {readingWordCount(lesson.text)} 词
                </small>
                <button
                  className="text-button"
                  onClick={() => setActive(lesson)}
                >
                  开始阅读 <ArrowUpRight size={16} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <p className="small muted content-credit">
        {contentLicense}。IELTS / TOEFL
        分类用于独立题型练习，均为原创示例；不是官方真题、完整模考或官方评分。
      </p>
    </>
  );
}

function ReadingExercise({
  lesson,
  timingPolicy,
  onBack,
  onCollectWord,
}: {
  lesson: ReadingLesson;
  timingPolicy: TimingPolicy;
  onBack: () => void;
  onCollectWord?: ReadingTrainerProps["onCollectWord"];
}) {
  const { state, update, notify, fail } = useStudy();
  const [clock] = useState(() => new ReadingSessionClock(lesson, timingPolicy));
  const [snapshot, setSnapshot] = useState<ReadingSnapshot>(() =>
    clock.snapshot(),
  );
  const [result, setResult] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ReadingWordSelection | null>(null);
  const [disputeReasons, setDisputeReasons] = useState<Record<string, string>>(
    {},
  );
  const [disputeBusy, setDisputeBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const submission = useRef<{ id: string; createdAt: string } | null>(null);
  const passage = useRef<HTMLDivElement>(null);
  const refresh = () => setSnapshot(clock.snapshot());

  useEffect(() => {
    const visibility = () => {
      clock.setHidden(document.hidden);
      setSnapshot(clock.snapshot());
    };
    visibility();
    const interval = setInterval(() => setSnapshot(clock.snapshot()), 250);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [clock]);

  function selectQuestion(index: number) {
    if (result !== null || busyRef.current) return;
    clock.selectQuestion(index);
    refresh();
  }
  function read() {
    if (result !== null || busyRef.current) return;
    clock.read();
    refresh();
  }
  function answer(index: number, value: number) {
    if (result !== null || busyRef.current) return;
    clock.answer(index, value);
    refresh();
  }
  async function submit() {
    if (busyRef.current || result !== null) return;
    busyRef.current = true;
    setBusy(true);
    try {
      clock.pause();
      const final = clock.snapshot();
      setSnapshot(final);
      submission.current ??= {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      const { id, createdAt } = submission.current;
      await update((current) =>
        commitReadingAttempt(current, lesson, final, id, createdAt),
      );
      setResult(
        final.questions.filter(
          (q, i) => q.answer === lesson.questions[i].correct,
        ).length / lesson.questions.length,
      );
      notify("阅读结果、逐题耗时和阅读阶段记录已一并保存");
    } catch (error) {
      fail(error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function dispute(questionId: string) {
    if (disputeBusy) return;
    setDisputeBusy(questionId);
    try {
      await update((current) =>
        disputeReadingQuestion(
          current,
          questionId,
          disputeReasons[questionId] ?? "",
        ),
      );
      notify("题目争议已保存；该题暂不纳入阅读正确率与题型耗时统计");
    } catch (error) {
      fail(error);
    } finally {
      setDisputeBusy(null);
    }
  }
  function captureSelection() {
    const selection = window.getSelection();
    if (
      !selection ||
      !passage.current?.contains(selection.anchorNode) ||
      !passage.current.contains(selection.focusNode)
    ) {
      setSelected(null);
      return;
    }
    setSelected(selectedReadingWord(lesson, selection.toString()));
  }
  async function collectWord() {
    if (!selected) return;
    try {
      if (onCollectWord) await onCollectWord(selected);
      else
        window.dispatchEvent(
          new CustomEvent("pilot-collect-word", { detail: selected }),
        );
      setSelected(null);
    } catch (error) {
      fail(error);
    }
  }
  const answered = snapshot.questions.filter((q) => q.answer !== null).length;
  const active = snapshot.activeQuestion;

  return (
    <>
      <button
        className="back-button"
        disabled={busy}
        onClick={() => {
          clock.pause();
          onBack();
        }}
      >
        <ArrowLeft size={16} />
        返回课程
      </button>
      <div className="exercise-title">
        <div>
          <div className="eyebrow">
            {lesson.level} · {lesson.category} · {examNames[lesson.exam]}
          </div>
          <h1 lang="en">{lesson.title}</h1>
        </div>
        <div className="timer">
          <span data-testid="reading-total-time">
            {time(snapshot.readingSeconds + snapshot.answerSeconds)}
          </span>
          <button
            disabled={result !== null || busy}
            aria-label={snapshot.running ? "暂停阅读计时" : "继续阅读计时"}
            onClick={() => {
              if (snapshot.running) clock.pause();
              else clock.resume();
              refresh();
            }}
          >
            {snapshot.running ? <Pause size={16} /> : <Play size={16} />}
          </button>
        </div>
      </div>
      <p className="small muted">
        {timingPolicy === "pause-hidden"
          ? "切到后台自动暂停，回到前台后恢复；手动暂停后需手动继续。"
          : "本次选择后台继续计时；手动暂停仍会停止计时。"}{" "}
        {contentLicense}。题目未校准，不换算考试成绩。
      </p>
      <div className="panel">
        <div className="section-line">
          <strong data-testid="reading-phase">
            {active === null ? "阅读原文" : `作答第 ${active + 1} 题`} ·{" "}
            {snapshot.effectiveRunning
              ? "计时中"
              : snapshot.running && snapshot.hidden
                ? "后台已暂停"
                : "已暂停"}
          </strong>
          <span className="small muted">
            阅读 {time(snapshot.readingSeconds)} · 作答{" "}
            {time(snapshot.answerSeconds)} · 已答 {answered}/
            {lesson.questions.length}
          </span>
        </div>
        <div className="actions">
          <button
            className="button secondary"
            disabled={result !== null || busy}
            aria-pressed={active === null}
            onClick={read}
          >
            阅读原文
          </button>
          {lesson.questions.map((question, i) => (
            <button
              key={question.id}
              className={`button ${active === i ? "primary" : "secondary"}`}
              disabled={result !== null || busy}
              aria-label={`切到第 ${i + 1} 题`}
              aria-pressed={active === i}
              onClick={() => selectQuestion(i)}
            >
              第 {i + 1} 题{snapshot.questions[i].answer !== null ? " ✓" : ""}
            </button>
          ))}
        </div>
        <p className="small muted">
          点击题目选项会切换到该题计时；继续阅读时点击“阅读原文”或原文区域。暂停期间也可选答案，暂停时段不累计。
        </p>
      </div>
      <div className="exercise-grid">
        <article className="panel passage" onPointerDown={read}>
          <div className="eyebrow">
            READ & UNDERSTAND · {readingWordCount(lesson.text)} WORDS
          </div>
          <div
            ref={passage}
            className="english-text"
            lang="en"
            onMouseUp={captureSelection}
            onKeyUp={captureSelection}
            tabIndex={0}
          >
            {lesson.text.split("\n").map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
          {selected && (
            <div className="soft-note">
              <span lang="en">{selected.headword}</span>
              <button
                className="text-button"
                onClick={() => void collectWord()}
              >
                收录选中生词
              </button>
            </div>
          )}
          <p className="small muted">
            选中原文中的英文单词或短语，可连同句子语境收录。
          </p>
        </article>
        <div className="panel quiz">
          <div className="section-line">
            <h2>检验理解</h2>
            <span className="tag">{lesson.questions.length} 题</span>
          </div>
          {lesson.questions.map((question, index) => {
            const item = snapshot.questions[index];
            const disputed = state.extension.disputes.some(
              (d) => d.kind === "question" && d.targetId === question.id,
            );
            return (
              <div key={question.id}>
                <fieldset
                  disabled={result !== null || busy}
                  onFocusCapture={() => selectQuestion(index)}
                >
                  <legend>
                    <span className="question-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {question.prompt}
                  </legend>
                  <p className="small muted">
                    {examNames[lesson.exam]} · {question.typeLabel} ·{" "}
                    {lesson.level} ·{" "}
                    <span data-testid={`reading-question-time-${index}`}>
                      {item.seconds.toFixed(1)} 秒
                    </span>{" "}
                    · 改答 {item.changes} 次
                  </p>
                  {question.options.map((option, optionIndex) => (
                    <label
                      className={`answer-option ${item.answer === optionIndex ? "selected" : ""}`}
                      key={option}
                    >
                      <input
                        type="radio"
                        name={`${lesson.id}-${index}`}
                        checked={item.answer === optionIndex}
                        onChange={() => answer(index, optionIndex)}
                      />
                      {option}
                    </label>
                  ))}
                  {result !== null && (
                    <div
                      className={`explanation ${item.answer === question.correct ? "correct" : "incorrect"}`}
                    >
                      <p>
                        {item.answer === question.correct
                          ? "✓ 回答正确"
                          : `正确答案：${question.options[question.correct]}`}
                      </p>
                      <p>{question.explanation}</p>
                      <blockquote lang="en">{question.evidence}</blockquote>
                      <p className="small">
                        首次进入题目：
                        {item.startedAt
                          ? new Date(item.startedAt).toLocaleTimeString(
                              "zh-CN",
                              { hour12: false },
                            )
                          : "未进入"}{" "}
                        · 累计有效耗时 {item.seconds.toFixed(1)} 秒 · 改答{" "}
                        {item.changes} 次
                      </p>
                    </div>
                  )}
                </fieldset>
                {disputed ? (
                  <p className="small muted" role="status">
                    第 {index + 1} 题已标记争议，等待复核；原始作答保留。
                  </p>
                ) : (
                  <details>
                    <summary className="small muted">
                      反馈第 {index + 1} 题的问题
                    </summary>
                    <label className="small">
                      争议原因
                      <textarea
                        aria-label={`第 ${index + 1} 题争议原因`}
                        maxLength={2000}
                        value={disputeReasons[question.id] ?? ""}
                        onChange={(event) =>
                          setDisputeReasons((current) => ({
                            ...current,
                            [question.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      className="text-button"
                      disabled={
                        disputeBusy !== null ||
                        !(disputeReasons[question.id] ?? "").trim()
                      }
                      onClick={() => void dispute(question.id)}
                    >
                      标记题目争议
                    </button>
                  </details>
                )}
              </div>
            );
          })}
          <button
            className="button primary full"
            disabled={
              busy || result !== null || answered !== lesson.questions.length
            }
            onClick={() => void submit()}
          >
            提交答案 <Check size={16} />
          </button>
          {result !== null && (
            <div className="result-inline" data-testid="exercise-result">
              <strong>{Math.round(result * 100)}%</strong>
              <span>
                本次练习正确率 · 已保存
                <br />
                <small>
                  逐题耗时与阅读阶段已保存；未校准题目，不换算考试成绩
                </small>
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
