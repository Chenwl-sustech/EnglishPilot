"use client";
import { useEffect, useRef, useState } from "react";
import type { PracticeSession } from "@/lib/practice-model";
import {
  itemAnswered,
  practiceCorrectness,
  practiceSummary,
  savePracticeAnswer,
  navigatePracticeQuestion,
  submitPracticeSection,
} from "@/lib/practice";
import { speak, stopPronunciation } from "@/lib/pronunciation";
import { useStudy } from "./study-context";
import { clockText } from "./use-stopwatch";
import { PracticeAudio, PracticeRecorder } from "./practice-recorder";
import { AiFeedback } from "./ai-feedback";
import { usePracticeTiming } from "./use-practice-timing";
import { PracticeOfficialAudio } from "./practice-official-audio";
import { measuredSkillSeconds } from "@/lib/practice-timing";
import { weeklyExamSource } from "@/lib/weekly-exam-bank";

export function PracticeWorkspace({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const { state } = useStudy();
  const session = state.extension.practiceSessions.find(
    (p) => p.id === sessionId,
  );
  if (!session) return <p role="alert">未找到试卷，请返回重新选择。</p>;
  return (
    <>
      <button className="back-button" onClick={onClose}>
        返回{session.kind === "weekly" ? "小测与历史" : "模拟考试"}
      </button>
      {session.status === "in-progress" ? (
        <PracticeSection
          key={`${session.id}:${session.sectionIndex}`}
          session={session}
        />
      ) : (
        <PracticeResults session={session} />
      )}
    </>
  );
}
function PracticeSection({ session }: { session: PracticeSession }) {
  const { state, update, notify, fail } = useStudy();
  const section = session.sections[session.sectionIndex];
  const [index, setIndex] = useState(session.questionIndex),
    [navigating, setNavigating] = useState(false),
    [now, setNow] = useState(() => Date.now()),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(0),
    [local, setLocal] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const revisions = useRef<Record<string, number>>({});
  const item = section.items[index],
    left = Math.max(0, Math.ceil((Date.parse(session.deadline) - now) / 1000));
  const value = local[item.id] ?? session.responses[item.id] ?? "";
  const questionTimer = usePracticeTiming(session, item.id);
  useEffect(() => {
    if (!navigating) setIndex(session.questionIndex);
  }, [session.questionIndex, navigating]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => {
      clearInterval(id);
      stopPronunciation();
    };
  }, []);
  const answered = section.items.filter((i) => itemAnswered(session, i)).length;
  async function change(text: string) {
    const revision = (revisions.current[item.id] ?? 0) + 1;
    revisions.current[item.id] = revision;
    setLocal((old) => ({ ...old, [item.id]: text }));
    setSaving((n) => n + 1);
    setError("");
    try {
      await update((s) => savePracticeAnswer(s, session.id, item.id, text));
      setLocal((old) => {
        if (revisions.current[item.id] !== revision) return old;
        const next = { ...old };
        delete next[item.id];
        return next;
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "保存失败，输入内容仍在当前页面",
      );
    } finally {
      setSaving((n) => n - 1);
    }
  }
  async function submit(incomplete = false) {
    if (busy) return;
    if (
      incomplete &&
      !window.confirm("结束当前分节？未作答题目会保留为空，无法返回本节补答。")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await questionTimer.flush(true);
      await update((s) =>
        submitPracticeSection(
          {
            ...s,
            drafts: {
              ...s.drafts,
              ...Object.fromEntries(
                Object.entries(local).map(([id, text]) => [
                  `practice-unsent:${session.id}:${id}`,
                  text,
                ]),
              ),
            },
          },
          session.id,
          session.sectionIndex,
          new Date(),
          incomplete,
        ),
      );
      notify("本节已交卷并保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : "交卷失败");
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function navigate(n: number) {
    if (navigating || busy || capturing) return;
    stopPronunciation();
    void questionTimer.flush(true).catch(fail);
    setShowTranscript(false);
    setIndex(n);
    setNavigating(true);
    try {
      await update((s) =>
        navigatePracticeQuestion(s, session.id, session.sectionIndex, n),
      );
    } catch (e) {
      setIndex(session.questionIndex);
      fail(e);
    } finally {
      setNavigating(false);
    }
  }
  const auditory =
    item.skill === "listening" ||
    item.questionType.includes("Listen and Repeat");
  return (
    <>
      <div className="exercise-title">
        <div>
          <div className="eyebrow">
            {session.exam.toUpperCase()} ·{" "}
            {session.kind === "weekly"
              ? "WEEKLY TEST"
              : "ORIGINAL PRACTICE EXAM"}
          </div>
          <h1>{section.title}</h1>
          <p>
            第 {session.sectionIndex + 1}/{session.sections.length} 节 · 已答{" "}
            {answered}/{section.items.length} 题
          </p>
        </div>
        <div className="timer" role="timer" aria-label="本节剩余时间">
          {clockText(left)}
        </div>
      </div>
      <p className="small muted">
        分节倒计时在后台继续；刷新后按原截止时间恢复。答案逐次保存；各节可以提前结束，未答内容不会伪造为已完成。
      </p>
      {questionTimer.enabled && (
        <div className="soft-note" aria-label="小测逐题计时">
          <span>
            本题有效时间{" "}
            <strong data-testid="question-active-time">
              {clockText(Math.floor(questionTimer.milliseconds / 1000))}
            </strong>
          </span>{" "}
          <button
            className="button secondary compact"
            disabled={busy || !left || questionTimer.status === "starting"}
            onClick={() =>
              void (
                questionTimer.status === "running"
                  ? questionTimer.pause()
                  : questionTimer.start()
              ).catch(fail)
            }
          >
            {questionTimer.status === "running"
              ? "暂停本题计时"
              : "继续本题计时"}
          </button>
          <p className="small muted">
            切题累计，后台自动暂停有效计时；暂停不延长上方分节截止时间。每秒保存一次，突然关闭可能丢失最后约一秒。
          </p>
          {questionTimer.notice && <p role="status">{questionTimer.notice}</p>}
        </div>
      )}
      {!left && (
        <p role="alert">
          本节时间已到，答案已锁定。请结束本节；口语录音结束后的保存宽限为30秒。
        </p>
      )}
      <nav className="question-nav" aria-label="试题导航">
        {section.items.map((i, n) => (
          <button
            key={i.id}
            disabled={capturing || busy || navigating}
            className={`button compact ${n === index ? "primary" : "secondary"}`}
            aria-label={`第${n + 1}题${itemAnswered(session, i) ? "（已答）" : ""}`}
            aria-current={n === index ? "step" : undefined}
            onClick={() => void navigate(n)}
          >
            {n + 1}
            {itemAnswered(session, i) ? " ✓" : ""}
          </button>
        ))}
      </nav>
      <section
        className="panel practice-question"
        data-testid="practice-question"
        data-question-id={item.id}
      >
        <span className="tag">
          {item.questionType} · 第 {index + 1} 题
        </span>
        {item.audio ? (
          <PracticeOfficialAudio
            key={item.audio.audioId}
            source={item.audio}
            questionId={item.id}
            disabled={
              !left ||
              (questionTimer.enabled && questionTimer.status !== "running")
            }
          />
        ) : auditory ? (
          <div className="actions">
            <button
              className="button secondary"
              disabled={!left}
              onClick={() =>
                speak(
                  item.context,
                  1,
                  (m) => setError(m),
                  state.extension.voicePreference,
                )
              }
            >
              播放本题材料
            </button>
            <button className="button secondary" onClick={stopPronunciation}>
              停止播放
            </button>
            <button
              className="text-button"
              onClick={() => setShowTranscript(!showTranscript)}
            >
              {showTranscript ? "隐藏原文" : "显示原文（辅助训练）"}
            </button>
          </div>
        ) : null}
        {item.audio && (
          <button
            className="text-button"
            onClick={() => setShowTranscript(!showTranscript)}
          >
            {showTranscript ? "隐藏原文" : "显示原文（辅助训练）"}
          </button>
        )}
        {item.context && (!auditory || showTranscript) && (
          <blockquote lang="en" className="practice-context">
            {item.context}
          </blockquote>
        )}
        <h2 lang="en">{item.prompt}</h2>
        {item.kind === "choice" ? (
          <fieldset disabled={!left || busy}>
            <legend className="sr-only">本题选项</legend>
            {item.options.map((o, n) => (
              <label className="answer-option" key={n}>
                <input
                  type="radio"
                  name={item.id}
                  checked={value === String(n)}
                  onChange={() => void change(String(n))}
                />
                {o}
              </label>
            ))}
          </fieldset>
        ) : item.kind === "speaking" ? (
          <PracticeRecorder
            key={item.id}
            sessionId={session.id}
            item={item}
            recordingId={session.audio[item.id]}
            disabled={!left || busy}
            onCaptureChange={setCapturing}
          />
        ) : (
          <label>
            {item.kind === "sentence" ? "句子或缺失字母答案" : "英文作答"}
            <textarea
              lang="en"
              aria-label={
                item.audio
                  ? "原音填空答案"
                  : item.kind === "sentence"
                    ? "句子答案"
                    : "模考英文作文"
              }
              rows={item.kind === "sentence" ? 3 : 14}
              value={value}
              disabled={!left || busy}
              maxLength={20000}
              onChange={(e) => void change(e.target.value)}
            />
            <span className="small muted">
              {value.trim().split(/\s+/).filter(Boolean).length} words
              {item.minWords ? ` · 建议至少 ${item.minWords} 词` : ""}
            </span>
          </label>
        )}
        <p className="small" role="status">
          {saving
            ? "正在保存答案…"
            : Object.keys(local).length
              ? "有尚未成功提交的输入，交卷时将另存为未计分草稿"
              : "答案已保存到本机"}
        </p>
        {!saving && local[item.id] !== undefined && left > 0 && (
          <button
            className="button secondary"
            onClick={() => void change(local[item.id])}
          >
            重试保存当前输入
          </button>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="actions">
          <button
            className="button secondary"
            disabled={!index || busy || capturing || navigating}
            onClick={() => void navigate(index - 1)}
          >
            上一题
          </button>
          <button
            className="button secondary"
            disabled={
              index === section.items.length - 1 ||
              busy ||
              capturing ||
              navigating
            }
            onClick={() => void navigate(index + 1)}
          >
            下一题
          </button>
        </div>
      </section>
      <div className="actions">
        <button
          className="button primary"
          disabled={
            busy ||
            capturing ||
            saving > 0 ||
            (left > 0 && answered !== section.items.length)
          }
          onClick={() => void submit()}
        >
          {session.sectionIndex === session.sections.length - 1
            ? "交卷并查看结果"
            : "结束本节并继续"}
        </button>
        {left > 0 && answered < section.items.length && (
          <button
            className="button secondary"
            disabled={busy || capturing || saving > 0}
            onClick={() => void submit(true)}
          >
            提前结束本节（保留未答）
          </button>
        )}
      </div>
    </>
  );
}
export function PracticeResults({ session }: { session: PracticeSession }) {
  const { state } = useStudy();
  const summary = practiceSummary(session);
  const measured = session.timing ? measuredSkillSeconds(session, 0) : null;
  const correctness = Object.assign(
    {},
    ...session.sections.map((_, index) => practiceCorrectness(session, index)),
  ) as Record<string, boolean>;
  const sources = [
    ...new Map(
      session.sections.flatMap((sec) =>
        sec.items.flatMap((i) =>
          i.audio ? [[i.audio.audioId, i.audio] as const] : [],
        ),
      ),
    ).values(),
  ];
  const allItems = session.sections.flatMap((sec) => sec.items);
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">PRACTICE RESULTS</div>
        <h1>{session.kind === "weekly" ? "本周小测结果" : "本次模考记录"}</h1>
        <p>
          {session.exam.toUpperCase()} · {session.date} ·{" "}
          {session.status === "abandoned" ? "已中止，已保存内容保留" : "已交卷"}
        </p>
      </div>
      <section className="panel">
        <h2>真实练习结果</h2>
        <p>
          已答 {summary.answered}/{summary.total} 题 · 客观题 {summary.correct}/
          {summary.objectiveCount} 正确 ·{" "}
          {session.timing ? "有效练习用时" : "分节用时"}{" "}
          {clockText(summary.seconds)}
        </p>
        {session.timing && (
          <p className="small muted">
            分节经过时长{" "}
            {clockText(
              session.results.reduce(
                (n, r) => n + (r.elapsedSeconds ?? r.seconds),
                0,
              ),
            )}
            ；逐题有效计时排除了暂停和后台时间。
          </p>
        )}
        <p className="muted">
          {session.kind === "weekly"
            ? "本卷为基础、阅读与听力客观题小测；题目与来源已保存，正确率不换算官方考试分数。"
            : "原创固定试卷，未经分数校准。客观正确率、写作AI模拟评价和口语录音分别保留；不会换算或写入官方分项及总分。主观题提交仅表示已作答。"}
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>分节</th>
                <th>已答</th>
                <th>客观正确</th>
                <th>用时</th>
              </tr>
            </thead>
            <tbody>
              {session.results.map((r) => (
                <tr key={r.sectionId}>
                  <td>
                    {session.sections.find((s) => s.id === r.sectionId)?.title}
                  </td>
                  <td>
                    {r.answered}/{r.total}
                  </td>
                  <td>
                    {r.objectiveCount
                      ? `${r.correct}/${r.objectiveCount}`
                      : "主观评价另列"}
                  </td>
                  <td>
                    {clockText(r.seconds)}
                    {r.timedOut ? " · 到时交卷" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {measured && (
        <section className="panel">
          <h2>按技能查看本次表现</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>技能</th>
                  <th>正确 / 题数</th>
                  <th>有效用时</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["foundation", "基础"],
                    ["reading", "阅读"],
                    ["listening", "听力"],
                  ] as const
                ).map(([skill, title]) => {
                  const items = allItems.filter((i) => i.skill === skill);
                  return (
                    <tr key={skill}>
                      <td>{title}</td>
                      <td>
                        {items.filter((i) => correctness[i.id]).length} /{" "}
                        {items.length}
                      </td>
                      <td>{clockText(measured[skill])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <details className="panel">
        <summary>逐题答案、解析与录音</summary>
        {session.sections.flatMap((sec) =>
          sec.items.map((i) => (
            <article className="practice-review" key={i.id}>
              <h3>
                {sec.title} · {i.questionType}
              </h3>
              <p lang="en">{i.prompt}</p>
              <p className="small muted">
                {session.timing
                  ? `本题有效时间 ${((session.timing.milliseconds[i.id] ?? 0) / 1000).toFixed(1)} 秒`
                  : "旧卷仅保留原分节用时，无逐题计时记录"}
              </p>
              {i.audio &&
                allItems.find((x) => x.audio?.audioId === i.audio!.audioId)
                  ?.id === i.id && (
                  <PracticeOfficialAudio source={i.audio} questionId={i.id} />
                )}
              {i.kind === "choice" || i.kind === "sentence" ? (
                <>
                  <p>
                    你的答案：
                    {i.kind === "choice"
                      ? (i.options[Number(session.responses[i.id] ?? -1)] ??
                        "未作答")
                      : session.responses[i.id] || "未作答"}{" "}
                    · {correctness[i.id] ? "正确" : "错误或未答"}
                  </p>
                  <p>
                    参考答案：
                    {i.acceptedAnswers.length
                      ? i.acceptedAnswers.join(" / ")
                      : i.kind === "choice"
                        ? i.options[i.correct!]
                        : i.expected}
                  </p>
                  <p>{i.explanation}</p>
                  <details>
                    <summary>查看原文依据</summary>
                    <p lang="en">{i.context}</p>
                  </details>
                </>
              ) : i.kind === "speaking" ? (
                session.audio[i.id] ? (
                  <PracticeAudio id={session.audio[i.id]} />
                ) : (
                  <p>本题未保存录音</p>
                )
              ) : (
                <p className="practice-context" lang="en">
                  {session.responses[i.id] || "未作答"}
                </p>
              )}
              {state.drafts[`practice-unsent:${session.id}:${i.id}`] && (
                <div>
                  <h4>未计分草稿（未成功提交的输入）</h4>
                  <p className="practice-context">
                    {state.drafts[`practice-unsent:${session.id}:${i.id}`]}
                  </p>
                </div>
              )}
            </article>
          )),
        )}
      </details>
      {session.sections.flatMap((sec) =>
        sec.items
          .filter((i) => i.kind === "writing")
          .map((i) => {
            const attempt = state.attempts.find(
              (a) => a.contentId === `${session.id}:${i.id}`,
            );
            return attempt ? (
              <AiFeedback
                key={i.id}
                attempt={attempt}
                exam={session.exam}
                taskType={i.questionType}
                prompt={`${i.context}\n${i.prompt}`}
              />
            ) : null;
          }),
      )}
      <section className="panel">
        <h2>本卷素材来源</h2>
        <p className="small muted">
          {session.kind === "weekly" && session.paperVersion === 2
            ? weeklyExamSource.name
            : "EnglishPilot 原创分级学习库 v2"}{" "}
          · CC BY 4.0。原创题库未作官方分数校准，教学级别不是CEFR认证。
        </p>
        {sources.map((source) => (
          <p className="small" key={source.audioId}>
            {source.title} · {source.publisher} · {source.license}{" "}
            <a href={source.sourceUrl} target="_blank" rel="noreferrer">
              来源
            </a>
          </p>
        ))}
        {session.kind === "mock" && (
          <p className="small muted">
            口语转写及文本反馈可在口语页面选择本次模考录音；转写失败不会删除音频。
          </p>
        )}
      </section>
    </>
  );
}
