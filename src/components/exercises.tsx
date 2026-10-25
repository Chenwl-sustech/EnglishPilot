"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  Headphones,
  Pause,
  Play,
  Volume2,
  RotateCcw,
  Star,
  Mic,
  Square,
  Download,
  Save,
} from "lucide-react";
import { useStudy } from "./study-context";
import { useStopwatch, clockText } from "./use-stopwatch";
import {
  readings,
  listenings,
  contentLicense,
  speakingPrompts,
  writingPrompts,
  type Lesson,
} from "@/lib/content";
import { grade, recordAttempt, today } from "@/lib/engine";
import {
  reviewFsrs,
  previewFsrs,
  rankDueReviews,
  formatReviewInterval,
} from "@/lib/fsrs";
import { vocabularyEntries } from "@/lib/vocabulary";
import { collectWord } from "./word-collector";
import { db, type Recording } from "@/lib/db";
import { stateSchema, type Skill } from "@/lib/model";
import { AiFeedback } from "./ai-feedback";
import { WhisperPanel } from "./whisper-panel";
import { speak, stopPronunciation } from "@/lib/pronunciation";
import { grammarLibrary, lessonLevel } from "@/lib/learning-library";
import { StudyLevel } from "./study-level";
import { persistWritingTime, consumeWritingTime } from "@/lib/writing-timing";
import { filterVocabulary } from "@/lib/vocabulary-import";
import { isVocabularyLearnable, openVocabularySources } from "@/lib/open-vocabulary";
import { VocabularyImportPanel } from "./vocabulary-import";
import { nativeBuild } from "@/lib/native/runtime";
import { recordingError } from "@/lib/recording-error";

export function ExerciseList({
  kind,
}: {
  kind: "grammar" | "reading" | "listening";
}) {
  const { state } = useStudy();
  const [active, setActive] = useState<Lesson | null>(null);
  const list = useMemo(
    () =>
      (kind === "grammar"
        ? grammarLibrary
        : kind === "reading"
          ? readings
          : listenings
      ).filter(
        (l) =>
          state.extension.studyLevel === "all" ||
          lessonLevel(l.id, l.level) === state.extension.studyLevel,
      ),
    [kind, state.extension.studyLevel],
  );
  const names = {
    grammar: [
      "语法，一点点理清。",
      "原创基础课程与分级题库 · 理解规则，再用练习巩固",
    ],
    reading: [
      "读懂文字，也读懂世界。",
      "10 篇原创分级阅读 · 从日常生活，到学术研究",
    ],
    listening: [
      "让每一次聆听，都有收获。",
      "5 组可播放的原创材料 · 浏览器合成语音，非真实考试录音",
    ],
  };
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "exercise",
    );
    if (requested) {
      const lesson = list.find((l) => l.id === requested);
      if (lesson) setActive(lesson);
    }
  }, [list]);
  useEffect(() => { if (active) window.scrollTo({ top: 0, behavior: "instant" }); }, [active?.id]);
  if (active)
    return (
      <Quiz
        key={active.id}
        lesson={active}
        skill={kind === "grammar" ? "foundation" : kind}
        kind={kind}
        onBack={() => setActive(null)}
      />
    );
  return (
    <>
      <PageHeading
        eyebrow={kind.toUpperCase()}
        title={names[kind][0]}
        description={names[kind][1]}
      />
      <div className="section-line">
        <span>{list.length} 个学习单元</span>
        <span className="small muted">按自己的节奏，循序渐进</span>
      </div>
      <StudyLevel />
      <div className="lesson-grid">
        {list.map((l, i) => {
          const attempts = state.attempts.filter((a) => a.contentId === l.id);
          return (
            <article className="panel lesson-card" key={l.id}>
              <div className={`lesson-icon ${kind}`}>
                {kind === "listening" ? (
                  <Headphones size={24} />
                ) : (
                  <BookOpen size={24} />
                )}
                <span>UNIT {String(i + 1).padStart(2, "0")}</span>
              </div>
              <div className="tags">
                <span>{l.level} · 难度参考</span>
                <span>{l.category}</span>
              </div>
              <h2>{l.title}</h2>
              <p>
                {kind === "grammar"
                  ? l.text.split("\n")[0]
                  : `${l.text.slice(0, 105)}…`}
              </p>
              <div className="lesson-footer">
                <small className="muted">
                  {attempts.length
                    ? `已练习 ${attempts.length} 次`
                    : `${l.questions.length} 道理解题`}
                </small>
                <button className="text-button" onClick={() => setActive(l)}>
                  {kind === "reading"
                    ? "开始阅读"
                    : kind === "grammar"
                      ? "学习这一课"
                      : "开始听力"}{" "}
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <p className="small muted content-credit">
        {contentLicense}。难度标签为教学参考，题目未作考试分数校准。
      </p>
    </>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
export function Quiz({
  lesson,
  skill,
  kind,
  onBack,
}: {
  lesson: Lesson;
  skill: Skill;
  kind: string;
  onBack: () => void;
}) {
  const { state, update, notify, fail } = useStudy();
  const [answers, setAnswers] = useState<number[]>([]),
    [result, setResult] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [transcript, setTranscript] = useState(false),
    [rate, setRate] = useState(1);
  const timer = useStopwatch();
  const id = useRef<string>("");
  useEffect(
    () => () => {
      stopPronunciation();
    },
    [],
  );
  async function submit() {
    if (busy || result !== null) return;
    setBusy(true);
    try {
      const score = grade(
        answers,
        lesson.questions.map((q) => q.correct),
      );
      id.current ||= crypto.randomUUID();
      await update((s) =>
        recordAttempt(s, {
          id: id.current,
          contentId: lesson.id,
          skill,
          date: today(),
          createdAt: new Date().toISOString(),
          seconds: timer.elapsed(),
          score,
          answer: JSON.stringify(answers),
          errors: lesson.questions.flatMap((q, i) =>
            answers[i] === q.correct
              ? []
              : [
                  `${q.prompt}\n你的答案：${q.options[answers[i]]}\n正确答案：${q.options[q.correct]}\n解析：${q.explanation}`,
                ],
          ),
        }),
      );
      timer.pause();
      setResult(score);
      notify("练习已保存，今日任务已更新");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} />
        返回课程
      </button>
      <div className="exercise-title">
        <div>
          <div className="eyebrow">
            {lesson.level} · {lesson.category}
          </div>
          <h1>{lesson.title}</h1>
        </div>
        <div className="timer">
          <span>{clockText(timer.seconds)}</span>
          <button
            aria-label={timer.running ? "暂停计时" : "继续计时"}
            disabled={result !== null}
            onClick={timer.toggle}
          >
            {timer.running ? <Pause size={16} /> : <Play size={16} />}
          </button>
        </div>
      </div>
      <p className="small muted">
        切换到后台会暂停学习计时；完成状态依据提交练习。{contentLicense}
      </p>
      <div className="exercise-grid">
        <article className="panel passage">
          {kind === "listening" ? (
            <>
              <Headphones size={32} />
              <h2>先听，再理解。</h2>
              <p className="muted">
                合成语音训练 · 英语语音包由浏览器或系统提供
              </p>
              <div className="actions">
                <button
                  className="button primary"
                  onClick={() =>
                    speak(
                      lesson.text,
                      rate,
                      (m) => fail(new Error(m)),
                      state.extension.voicePreference,
                    )
                  }
                >
                  <Play size={16} />
                  播放全文
                </button>
                <button
                  className="button secondary"
                  onClick={stopPronunciation}
                >
                  <Square size={16} />
                  停止
                </button>
                <label className="rate-label">
                  语速
                  <select
                    value={rate}
                    onChange={(e) => setRate(Number(e.target.value))}
                  >
                    {[0.75, 1, 1.25].map((r) => (
                      <option value={r} key={r}>
                        {r}×
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                className="text-button"
                onClick={() => setTranscript(!transcript)}
              >
                {transcript ? "隐藏" : "显示"}原文
              </button>
              {transcript && (
                <p lang="en" className="english-text">
                  {lesson.text}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="eyebrow">
                {kind === "grammar" ? "LESSON NOTES" : "READ & UNDERSTAND"}
              </div>
              <div
                className={
                  kind === "grammar" ? "grammar-notes" : "english-text"
                }
                lang={kind === "grammar" ? "zh-CN" : "en"}
              >
                {lesson.text.split("\n").map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </>
          )}
        </article>
        <div className="panel quiz">
          <div className="section-line">
            <h2>检验理解</h2>
            <span className="tag">{lesson.questions.length} 题</span>
          </div>
          {lesson.questions.map((q, i) => (
            <fieldset key={q.prompt} disabled={result !== null}>
              <legend>
                <span className="question-number">0{i + 1}</span>
                {q.prompt}
              </legend>
              {q.options.map((o, j) => (
                <label
                  className={`answer-option ${answers[i] === j ? "selected" : ""}`}
                  key={o}
                >
                  <input
                    type="radio"
                    name={`${lesson.id}-${i}`}
                    checked={answers[i] === j}
                    onChange={() =>
                      setAnswers((a) => {
                        const n = [...a];
                        n[i] = j;
                        return n;
                      })
                    }
                  />
                  {o}
                </label>
              ))}
              {result !== null && (
                <p
                  className={`explanation ${answers[i] === q.correct ? "correct" : "incorrect"}`}
                >
                  {answers[i] === q.correct
                    ? "✓ 回答正确"
                    : "正确答案：" + q.options[q.correct]}
                  <br />
                  {q.explanation}
                </p>
              )}
            </fieldset>
          ))}
          <button
            className="button primary full"
            disabled={
              busy ||
              result !== null ||
              answers.filter((a) => a !== undefined).length !==
                lesson.questions.length
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
                <small>未校准题目，不换算考试成绩</small>
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
export function Vocabulary() {
  const { state, update, notify, fail } = useStudy();
  useEffect(() => () => stopPronunciation(), []);
  const [category, setCategory] = useState("全部"),
    [revealed, setRevealed] = useState(false),
    [busy, setBusy] = useState(false),
    [spelling, setSpelling] = useState(false),
    [answer, setAnswer] = useState("");
  const timer = useStopwatch();
  const [now, setNow] = useState(() => new Date());
  const [requestedWord, setRequestedWord] = useState("");
  const [query, setQuery] = useState("");
  const [sourceId, setSourceId] = useState("");
  useEffect(() => {
    setRequestedWord(
      new URLSearchParams(window.location.search).get("exercise") ?? "",
    );
  }, []);
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(i);
  }, []);
  const entries = useMemo(() => vocabularyEntries(state), [state.extension.userWords]);
  const matches = useMemo(() => filterVocabulary(entries, query, sourceId), [entries, query, sourceId]);
  const matchedIds = new Set(matches.map((word) => word.id));
  const reviews = state.extension.fsrsReviews;
  const ranked = rankDueReviews(reviews, now).map(([id]) => id);
  const rankOrder = new Map(ranked.map((id, index) => [id, index]));
  const due = [
    ...entries
      .filter((w) => rankOrder.has(w.id))
      .sort((a, b) => rankOrder.get(a.id)! - rankOrder.get(b.id)!),
    ...entries.filter((w) => !reviews[w.id] || reviews[w.id].card.state === 0),
  ].filter((w) => matchedIds.has(w.id) && isVocabularyLearnable(w) && (category === "全部" || w.category === category));
  const filteredDue = due.filter(
    (w) =>
      rankOrder.has(w.id) ||
      state.extension.studyLevel === "all" ||
      w.level === state.extension.studyLevel,
  );
  const requested = entries.find((w) => w.id === requestedWord);
  const word = requested ?? filteredDue[0];
  async function review(
    rating: "again" | "hard" | "good" | "easy",
    score: number | null = null,
  ) {
    if (!word || busy) return;
    setBusy(true);
    try {
      await update((s) => {
        const updated = recordAttempt(s, {
          id: crypto.randomUUID(),
          contentId: word.id,
          skill: "foundation",
          date: today(),
          createdAt: new Date().toISOString(),
          seconds: timer.elapsed(),
          score,
          answer: score === null ? rating : answer,
          errors:
            score === 0
              ? [
                  `词汇拼写：${word.meaning}；你的答案：${answer}；正确答案：${word.word}`,
                ]
              : [],
        });
        return {
          ...updated,
          extension: {
            ...updated.extension,
            fsrsReviews: {
              ...s.extension.fsrsReviews,
              [word.id]: reviewFsrs(
                s.extension.fsrsReviews[word.id],
                rating,
                new Date(),
              ),
            },
          },
        };
      });
      setRevealed(false);
      setAnswer("");
      setRequestedWord("");
      timer.reset();
      setNow(new Date());
      notify(`${word.word} 的复习已记录，下次复习由真实 FSRS-6 计算`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="VOCABULARY · SMALL WORDS, BIG POSSIBILITIES"
        title="让词汇，慢慢变成你的。"
        description={`${entries.length.toLocaleString()} 个去重词头 · ${entries.filter(isVocabularyLearnable).length.toLocaleString()} 个有释义词卡 · FSRS-6 间隔复习`}
      />
      <VocabularyImportPanel />
      <div className="panel vocabulary-search">
        <label>搜索词头、中文或英文释义<input type="search" value={query} placeholder="例如 algorithm / 算法" onChange={(e) => { setQuery(e.target.value); setRequestedWord(""); setRevealed(false); }} /></label>
        <label>按词表查看<select value={sourceId} onChange={(e) => { setSourceId(e.target.value); setCategory("全部"); setRequestedWord(""); setRevealed(false); }}>
          <option value="">全部来源</option>
          {openVocabularySources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          {state.extension.sources.filter((s) => !openVocabularySources.some((open) => open.id === s.id) && entries.some((w) => w.sources.includes(s.id))).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
        {(query.trim() || sourceId) && <>
          <p className="small muted">找到 {matches.length.toLocaleString()} 个词头，显示前 30 个；仅词头条目可查看和补充释义。</p>
          <div className="actions vocabulary-matches">{matches.slice(0, 30).map((w) => <button className="button secondary compact" key={w.id} onClick={() => { setRequestedWord(w.id); setRevealed(false); setSpelling(false); setAnswer(""); }}>{w.word}{!isVocabularyLearnable(w) ? " · 待补释义" : ""}</button>)}</div>
        </>}
      </div>
      <div className="section-line">
        <div className="tabs">
          {[
            "全部",
            "学术基础",
            "日常交流",
            "科研英语",
            "分级词库",
            "个人生词",
          ].map((c) => (
            <button
              className={category === c ? "active" : ""}
              onClick={() => {
                setCategory(c);
                setRequestedWord("");
                setRevealed(false);
              }}
              key={c}
            >
              {c}
            </button>
          ))}
        </div>
        <button
          className="text-button"
          onClick={() =>
            collectWord({ headword: "", context: "", source: "个人录入" })
          }
        >
          添加个人生词
        </button>
        <button
          className="button secondary compact"
          disabled={!word || !isVocabularyLearnable(word)}
          onClick={() => {
            setSpelling(!spelling);
            setRevealed(false);
            setAnswer("");
          }}
        >
          {spelling ? "切换词卡" : "练习拼写"}
        </button>
      </div>
      <StudyLevel />
      <div className="vocabulary-layout">
        <div className="panel flashcard">
          <div className="vocab-timer timer">
            <span>本次 {clockText(timer.seconds)}</span>
            <button
              aria-label={timer.running ? "暂停词汇计时" : "继续词汇计时"}
              onClick={timer.toggle}
            >
              {timer.running ? <Pause size={16} /> : <Play size={16} />}
            </button>
          </div>
          {word ? (
            <>
              <div className="section-line">
                <span className="tag">
                  {word.category} ·{" "}
                  {reviews[word.id]?.card.reps ? "到期复习" : "新词"}
                </span>
                <button
                  className={`icon-button ${state.favorites.includes(word.id) ? "starred" : ""}`}
                  aria-label="收藏单词"
                  onClick={() =>
                    void update((s) => ({
                      ...s,
                      favorites: s.favorites.includes(word.id)
                        ? s.favorites.filter((id) => id !== word.id)
                        : [...s.favorites, word.id],
                    })).catch(() => {})
                  }
                >
                  <Star size={20} />
                </button>
              </div>
              <div className="word-center">
                <div className="eyebrow">
                  {spelling ? "RECALL & SPELL" : "TAKE A MOMENT TO RECALL"}
                </div>
                <h2 lang="en">{spelling ? word.meaning || word.definition : word.word}</h2>
                {!spelling && (
                  <button
                    className="pronunciation"
                    onClick={() =>
                      speak(
                        word.word,
                        1,
                        (m) => fail(new Error(m)),
                        state.extension.voicePreference,
                      )
                    }
                  >
                    {word.ipa}
                    <Volume2 size={18} />
                  </button>
                )}
                {spelling ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const ok = answer.trim().toLowerCase() === word.word.toLowerCase();
                      void review(ok ? "good" : "again", ok ? 1 : 0);
                    }}
                  >
                    <input
                      autoComplete="off"
                      aria-label="英文拼写"
                      placeholder="输入英文单词"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                    />
                    <button
                      className="button primary"
                      disabled={!answer.trim() || busy}
                    >
                      检查拼写
                    </button>
                  </form>
                ) : revealed ? (
                  <div className="word-definition">
                    <p>
                      <span>{word.pos}</span> {word.meaning || (word.definition ? "中文释义待补充" : "此词表仅提供词头与词族，释义待补充")}
                    </p>
                    <p lang="en">{word.definition}</p>
                    <blockquote lang="en">{word.example}</blockquote>
                    <details className="word-provenance">
                      <summary>搭配、词族与字段来源</summary>
                      <p>
                        搭配：{word.collocations.join("；") || "尚未补充"}
                        <br />
                        同义词：{word.synonyms.join("；") || "尚未补充"}
                        <br />
                        词族：{word.family.join("；") || "尚未补充"}
                        <br />
                        CEFR：{word.cefr ?? "无可靠来源，暂不标注"}
                      </p>
                      {Object.entries(word.fieldSources).map(
                        ([field, source]) => (
                          <p key={field}>
                            {field}：{source}
                          </p>
                        ),
                      )}
                    </details>
                  </div>
                ) : (
                  <>
                    <p className="muted">{isVocabularyLearnable(word) ? "回想它的意思，再翻开看看。" : "此条仅有词头与词族，可先补充释义后加入记忆练习。"}</p>
                    <button
                      className="button primary"
                      onClick={() => setRevealed(true)}
                    >
                      {isVocabularyLearnable(word) ? "显示释义" : "查看词族与来源"} <RotateCcw size={16} />
                    </button>
                    {!isVocabularyLearnable(word) && <button className="button secondary" onClick={() => collectWord({ headword: word.word, context: "", source: word.sources.join("; ") })}>补充释义</button>}
                  </>
                )}
              </div>
              {revealed && !spelling && isVocabularyLearnable(word) && (
                <div className="review-buttons">
                  {(["again", "hard", "good", "easy"] as const).map((r, i) => (
                    <button
                      disabled={busy}
                      key={r}
                      onClick={() => void review(r)}
                    >
                      <strong>
                        {
                          [
                            "Again · 再学一次",
                            "Hard · 有点难",
                            "Good · 记住了",
                            "Easy · 很轻松",
                          ][i]
                        }
                      </strong>
                      <small>
                        {formatReviewInterval(
                          previewFsrs(reviews[word.id], now)[r].card.due,
                          now,
                        )}
                      </small>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="empty">
              <Check size={38} />
              <h2>{matches.some(isVocabularyLearnable) ? "这一筛选下暂时没有到期词卡。" : "这一筛选下暂无带释义的词卡。"}</h2>
              <p>可以调整级别或来源，或搜索词头并补充释义。</p>
            </div>
          )}
        </div>
        <aside className="panel vocab-side">
          <div className="eyebrow">YOUR WORD JOURNEY</div>
          <h2>积累，有迹可循。</h2>
          <div className="vocab-stat">
            <span>待学 / 到期</span>
            <strong>{due.length}</strong>
          </div>
          <div className="vocab-stat">
            <span>已建立复习记录</span>
            <strong>
              {Object.values(reviews).filter((r) => r.card.reps > 0).length}
            </strong>
          </div>
          <div className="vocab-stat">
            <span>稳定记忆*</span>
            <strong>
              {
                Object.values(reviews).filter(
                  (r) => r.card.state === 2 && r.card.stability >= 21,
                ).length
              }
            </strong>
          </div>
          <p className="small muted">
            * FSRS Review 状态且稳定度至少 21
            天。稳定度是记忆模型估计，不是已掌握证明；旧 SM-2
            记录保留。Again/Hard/Good/Easy 使用 ts-fsrs 计算分钟级或天级间隔。
          </p>
          <div className="soft-note">
            先回忆，再查看。
            <br />
            比反复浏览，更认真地练习一次。
          </div>
          {word && reviews[word.id] && (
            <div className="fsrs-state">
              <p className="small">
                Stability {reviews[word.id].card.stability.toFixed(2)} 天 ·
                Difficulty {reviews[word.id].card.difficulty.toFixed(2)}
                <br />
                复习 {reviews[word.id].card.reps} 次 · 遗忘{" "}
                {reviews[word.id].card.lapses} 次<br />
                到期{" "}
                {new Date(reviews[word.id].card.due).toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai",
                })}
              </p>
              <details>
                <summary>真实复习历史</summary>
                {reviews[word.id].history.slice(-8).map((log, i) => (
                  <p className="small" key={i}>
                    {new Date(log.review).toLocaleString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                    })}{" "}
                    · Rating {log.rating}
                  </p>
                ))}
              </details>
            </div>
          )}
          <p className="small muted">原创示例与开放词表分项署名；仅词头条目不进入空白记忆卡。</p>
          <details>
            <summary>词库来源与许可</summary>
            {state.extension.sources.map((source) => (
              <div key={source.id}>
                <p className="small">
                  {source.name} · {source.attribution} ·{" "}
                  {source.licenseUrl ? (
                    <a
                      href={source.licenseUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {source.license}
                    </a>
                  ) : (
                    source.license
                  )}
                  <br />
                  {source.modification}
                </p>
              </div>
            ))}
          </details>
        </aside>
      </div>
    </>
  );
}
export function Writing() {
  const { state } = useStudy();
  const [index, setIndex] = useState(0);
  const [exam, setExam] = useState<"ielts" | "toefl">(
    state.profile.mode === "dual" ? state.profile.primary : state.profile.mode,
  );
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("exercise");
    const n = Number(id?.replace("writing-", ""));
    if (id && Number.isInteger(n) && n >= 0 && n < writingPrompts.length) {
      setIndex(n);
      if (writingPrompts[n][2].includes("IELTS")) setExam("ielts");
      if (writingPrompts[n][2].includes("TOEFL")) setExam("toefl");
    }
  }, []);
  return (
    <>
      <PageHeading
        eyebrow="WRITING · FIND YOUR VOICE"
        title="把想法，写得更清楚。"
        description="原创考试对应题目 · 自动存稿与版本记录 · 可配置 AI 逐项语言反馈"
      />
      <label className="prompt-select">
        考试模式
        <select
          value={exam}
          onChange={(e) => {
            setExam(e.target.value as "ielts" | "toefl");
            setIndex(0);
          }}
        >
          <option value="ielts">IELTS</option>
          <option value="toefl">TOEFL 2026</option>
        </select>
      </label>
      <label className="prompt-select">
        选择写作任务
        <select
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
        >
          {writingPrompts.map(
            (p, i) =>
              !p[2].includes(exam === "ielts" ? "TOEFL" : "IELTS") && (
                <option key={p[0]} value={i}>
                  {p[2]} · {p[0]}
                </option>
              ),
          )}
        </select>
      </label>
      <WritingEditor key={index} index={index} exam={exam} />
    </>
  );
}
function WritingEditor({
  index,
  exam,
}: {
  index: number;
  exam: "ielts" | "toefl";
}) {
  const { state, update, notify, fail } = useStudy();
  const id = `writing-${index}`;
  const savedTime = state.extension.writingTimers[id] ?? {
    epoch: 0,
    seconds: 0,
  };
  const [epoch, setEpoch] = useState(savedTime.epoch);
  const renderEpoch = epoch;
  const [text, setText] = useState(state.drafts[id] ?? ""),
    [lastSubmitted, setLastSubmitted] = useState(""),
    [busy, setBusy] = useState(false);
  const timer = useStopwatch(false, savedTime.seconds);
  const activeSeconds = timer.seconds,
    restoreTimer = timer.restore,
    clockRunning = timer.running,
    elapsedTime = timer.elapsed;
  useEffect(() => {
    if (
      !busy &&
      (savedTime.epoch !== epoch ||
        (!clockRunning && savedTime.seconds > elapsedTime()))
    ) {
      setEpoch(savedTime.epoch);
      restoreTimer(savedTime.seconds);
    }
  }, [
    savedTime.epoch,
    savedTime.seconds,
    epoch,
    busy,
    clockRunning,
    elapsedTime,
    restoreTimer,
  ]);
  useEffect(() => {
    if (busy || activeSeconds === 0) return;
    void update((s) => persistWritingTime(s, id, renderEpoch, activeSeconds), {
      silent: true,
    }).catch(fail);
  }, [activeSeconds, busy, id, renderEpoch, update, fail]);
  const count = text.trim() ? text.trim().split(/\s+/).length : 0;
  const prompt = writingPrompts[index];
  const timeLimit = /Task 1/.test(prompt[2])
    ? 20 * 60
    : /Task 2/.test(prompt[2])
      ? 40 * 60
      : /Email/.test(prompt[2])
        ? 7 * 60
        : /Discussion/.test(prompt[2])
          ? 10 * 60
          : null;
  const target = /Task 1/.test(prompt[2])
    ? "至少 150 词"
    : /Task 2/.test(prompt[2])
      ? "至少 250 词"
      : /Discussion/.test(prompt[2])
        ? "建议至少 100 词"
        : "按题目要求";
  const dirty = useRef(false),
    latestText = useRef(text),
    draftBaseline = useRef(state.drafts[id] ?? "");
  const [conflict, setConflict] = useState(false);
  const saveDraft = useCallback(async () => {
    const value = latestText.current,
      expected = draftBaseline.current;
    await update((s) => {
      const remote = s.drafts[id] ?? "";
      if (remote !== expected && remote !== value)
        throw new Error(
          "其他窗口已保存更新的草稿。你的文字仍保留在编辑器，请提交保存为版本，或复制后刷新。",
        );
      return { ...s, drafts: { ...s.drafts, [id]: value } };
    });
    draftBaseline.current = value;
    if (latestText.current === value) dirty.current = false;
    setConflict(false);
  }, [id, update]);
  useEffect(() => {
    if (!dirty.current) {
      const remote = state.drafts[id] ?? "";
      draftBaseline.current = remote;
      latestText.current = remote;
      setText(remote);
    }
  }, [state.drafts, id]);
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      void saveDraft().catch(() => setConflict(true));
    }, 600);
    return () => clearTimeout(t);
  }, [text, saveDraft]);
  useEffect(
    () => () => {
      if (dirty.current) void saveDraft().catch(() => {});
    },
    [saveDraft],
  );
  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      if (count < 20) throw new Error("请至少写 20 个词，再提交本次练习");
      await update((s) => {
        const consumed = consumeWritingTime(s, id, epoch, timer.elapsed());
        return recordAttempt(
          { ...consumed.state, drafts: { ...s.drafts, [id]: text } },
          {
            id: crypto.randomUUID(),
            skill: "writing",
            contentId: id,
            date: today(),
            createdAt: new Date().toISOString(),
            seconds: consumed.seconds,
            score: null,
            answer: text,
            errors: [],
          },
        );
      });
      setEpoch(epoch + 1);
      setLastSubmitted(text);
      dirty.current = false;
      draftBaseline.current = text;
      setConflict(false);
      timer.reset(false);
      notify("写作版本已保存；未评分，未生成考试成绩");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const versions = state.attempts.filter((a) => a.contentId === id);
  return (
    <>
      <div className="writing-grid">
        <article className="panel writing-editor">
          <div className="section-line">
            <span className="tag">{prompt[2]}</span>
            <div className="timer">
              <span>
                {timeLimit !== null
                  ? `剩余 ${clockText(Math.max(0, timeLimit - timer.seconds))}`
                  : clockText(timer.seconds)}
              </span>
              <button
                aria-label={timer.running ? "暂停计时" : "开始计时"}
                onClick={() =>
                  timer.running
                    ? timer.pause()
                    : timer.restore(
                        Math.max(timer.elapsed(), savedTime.seconds),
                        true,
                      )
                }
              >
                {timer.running ? <Pause size={16} /> : <Play size={16} />}
              </button>
            </div>
          </div>
          <h2 lang="en">{prompt[0]}</h2>
          <p lang="en" className="writing-prompt">
            {prompt[1]}
          </p>
          <p className="small muted">
            目标字数：{target}
            {timeLimit !== null && " · 训练计时不自动删除或提交草稿"}
          </p>
          <textarea
            lang="en"
            aria-label="英文作文"
            placeholder="Start with one clear idea…"
            maxLength={100000}
            value={text}
            disabled={busy}
            onFocus={() => {
              if (!timer.running)
                timer.restore(
                  Math.max(timer.elapsed(), savedTime.seconds),
                  true,
                );
            }}
            onChange={(e) => {
              dirty.current = true;
              latestText.current = e.target.value;
              setText(e.target.value);
              if (!timer.running && text === lastSubmitted)
                timer.restore(
                  Math.max(timer.elapsed(), savedTime.seconds),
                  true,
                );
            }}
          />
          <div className="section-line">
            <span className="small muted">
              {count} words ·{" "}
              {conflict
                ? "草稿有外部更新，请手动保存版本"
                : (state.drafts[id] ?? "") === text
                  ? "草稿已自动保存"
                  : "正在保存草稿…"}
            </span>
            <button
              className="button primary"
              disabled={busy || count < 20 || text === lastSubmitted}
              onClick={() => void submit()}
            >
              <Save size={16} />
              提交并保存版本
            </button>
          </div>
        </article>
        <aside className="panel">
          <div className="eyebrow">A LITTLE GUIDANCE</div>
          <h2>让表达更进一步</h2>
          <ul className="guidance">
            <li>先用一句话写清主要观点。</li>
            <li>为观点补充具体理由或例子。</li>
            <li>检查时态、主谓一致和连接。</li>
            <li>读一遍，删除不必要的重复。</li>
          </ul>
          <p className="small muted">
            保存版本后可请求 AI
            分析。模拟反馈与客观题正确率、可信模考成绩分别保存。
          </p>
          <h3>历史版本 · {versions.length}</h3>
          {versions.length ? (
            versions
              .slice()
              .reverse()
              .map((v, i) => (
                <details className="version" key={v.id}>
                  <summary>
                    {v.date} · 版本 {versions.length - i}
                  </summary>
                  <p lang="en">{v.answer}</p>
                </details>
              ))
          ) : (
            <p className="muted small">提交后，版本会出现在这里。</p>
          )}
        </aside>
      </div>
      {versions.length > 0 && (
        <AiFeedback
          attempt={versions.at(-1)!}
          exam={exam}
          taskType={prompt[2]}
          prompt={prompt[1]}
          previousText={versions.at(-2)?.answer}
        />
      )}
    </>
  );
}
export function Speaking() {
  const { state } = useStudy();
  const [index, setIndex] = useState(0);
  const [exam, setExam] = useState<"ielts" | "toefl">(
    state.profile.mode === "dual" ? state.profile.primary : state.profile.mode,
  );
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("exercise");
    const n = Number(id?.replace("speaking-", ""));
    if (id && Number.isInteger(n) && n >= 0 && n < speakingPrompts.length) {
      setIndex(n);
      if (speakingPrompts[n][2].includes("TOEFL")) setExam("toefl");
      else if (speakingPrompts[n][2].includes("IELTS")) setExam("ielts");
    }
  }, []);
  return (
    <>
      <PageHeading
        eyebrow="SPEAKING · ONE SENTENCE AT A TIME"
        title="开口，就是很好的开始。"
        description={nativeBuild ? "原创话题 · 本地录音与回放 · 手工核对文本后可请求 AI 语言反馈" : "原创话题 · 本地录音与回放 · 本地 Whisper 转写 · 核对文本后可请求语言反馈"}
      />
      <label className="prompt-select">
        口语考试模式
        <select
          value={exam}
          onChange={(e) => {
            setExam(e.target.value as typeof exam);
            setIndex(0);
          }}
        >
          <option value="ielts">IELTS</option>
          <option value="toefl">TOEFL 2026</option>
        </select>
      </label>
      <label className="prompt-select">
        选择口语话题
        <select
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
        >
          {speakingPrompts.map(
            (p, i) =>
              !p[2].includes(exam === "ielts" ? "TOEFL" : "IELTS") && (
                <option key={p[0]} value={i}>
                  {p[2]} · {p[0]}
                </option>
              ),
          )}
        </select>
      </label>
      <Recorder key={index} index={index} />
      <WhisperPanel />
    </>
  );
}
function Recorder({ index }: { index: number }) {
  const { state, update, notify, fail } = useStudy();
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    started = useRef(0),
    seconds = useRef(0),
    alive = useRef(true);
  const [recording, setRecording] = useState(false),
    [pending, setPending] = useState<Blob | null>(null),
    [history, setHistory] = useState<Recording[]>([]),
    [busy, setBusy] = useState(false);
  const prompt = speakingPrompts[index];
  const preparation = useStopwatch(false);
  const prepLimit = prompt[2].includes("Part 2") ? 60 : 30;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopPronunciation();
      const r = recorder.current;
      if (r && r.state !== "inactive") r.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    void db.recordings.toArray().then(setHistory).catch(fail);
  }, [state.attempts.length, fail]);
  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "此浏览器无法录音，请使用 localhost 或 HTTPS 下的现代浏览器。",
        );
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const r = new MediaRecorder(media);
      const chunks: BlobPart[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        seconds.current = Math.floor(
          (performance.now() - started.current) / 1000,
        );
        media.getTracks().forEach((t) => t.stop());
        if (alive.current) {
          setPending(new Blob(chunks, { type: r.mimeType }));
          setRecording(false);
        }
      };
      r.start();
      recorder.current = r;
      started.current = performance.now();
      setRecording(true);
      setPending(null);
    } catch (e) {
      fail(recordingError(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      await db.transaction("rw", [db.recordings, db.state], async () => {
        await db.recordings.put({
          id,
          blob: pending,
          date: today(),
          title: prompt[0],
        });
        const row = await db.state.get("main");
        if (!row) throw new Error("学习记录尚未加载");
        await db.state.put({
          id: "main",
          value: stateSchema.parse(
            recordAttempt(row.value, {
              id,
              contentId: `speaking-${index}`,
              skill: "speaking",
              date: today(),
              createdAt: new Date().toISOString(),
              seconds: seconds.current,
              score: null,
              answer: "本地录音：" + prompt[0],
              errors: [],
            }),
          ),
        });
      });
      await update((s) => s);
      setPending(null);
      notify("口语录音已保存在本设备，未上传、未评分");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="writing-grid">
      <div className="panel recorder">
        <span className="tag">{prompt[2]}</span>
        <div className={`mic-orb ${recording ? "is-recording" : ""}`}>
          <Mic size={40} />
        </div>
        <h2>{prompt[0]}</h2>
        <p lang="en" className="speaking-question">
          {prompt[1]}
        </p>
        <p className="muted small">
          先想一个要点，再举一个例子。建议回答 30–90 秒。
        </p>
        <p className="small">
          训练准备：{clockText(Math.max(0, prepLimit - preparation.seconds))}{" "}
          <button className="text-button" onClick={preparation.toggle}>
            {preparation.running ? "暂停准备" : "开始准备"}
          </button>{" "}
          <button
            className="text-button"
            onClick={() => preparation.reset(false)}
          >
            重置
          </button>
          <br />
          <small>可选练习准备时间，不代表完整考试计时规则。</small>
        </p>
        <div className="actions centered">
          <button
            className="button secondary"
            onClick={() =>
              speak(
                prompt[1],
                1,
                (m) => fail(new Error(m)),
                state.extension.voicePreference,
              )
            }
          >
            <Volume2 size={16} />
            朗读题目
          </button>
          {recording ? (
            <button
              className="button danger"
              onClick={() => recorder.current?.stop()}
            >
              <Square size={16} />
              结束录音
            </button>
          ) : (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void start()}
            >
              <Mic size={16} />
              开始录音
            </button>
          )}
        </div>
        {recording && (
          <p role="status" className="recording-indicator">
            ● 正在录音，结束后可回放并保存
          </p>
        )}
        {pending && (
          <div className="pending-audio">
            <AudioBlob blob={pending} />
            <button
              className="button primary"
              disabled={busy || pending.size === 0}
              onClick={() => void save()}
            >
              <Save size={16} />
              保存本次口语练习
            </button>
          </div>
        )}
        <p className="small muted">
          录音仅保存在本设备。设置页的完整备份包含音频，JSON备份不包含音频；也可单独下载。离开页面会关闭麦克风。
        </p>
      </div>
      <aside className="panel">
        <div className="eyebrow">YOUR RECORDINGS</div>
        <h2>听见自己的进步</h2>
        {history.length ? (
          history
            .slice()
            .reverse()
            .map((r) => (
              <div key={r.id} className="recording-row">
                <h3>{r.title}</h3>
                <small>{r.date}</small>
                <AudioBlob blob={r.blob} download={r.id} />
              </div>
            ))
        ) : (
          <div className="empty small">
            <Headphones size={28} />
            <p>
              还没有录音。
              <br />
              今天留下第一段声音。
            </p>
          </div>
        )}
        <p className="small muted">
          在下方选择录音进行本地转写与文本反馈。发音维度暂无法可靠评分。
        </p>
      </aside>
    </div>
  );
}
function AudioBlob({ blob, download }: { blob: Blob; download?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return (
    <div className="audio-blob">
      <audio controls src={url || undefined} preload="metadata" />
      {download && url && (
        <a
          href={url}
          download={`${download}.${blob.type.includes("mp4") ? "mp4" : "webm"}`}
          aria-label="下载录音"
        >
          <Download size={17} />
        </a>
      )}
    </div>
  );
}
