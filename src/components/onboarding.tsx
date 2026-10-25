"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  Compass,
  Check,
  ShieldCheck,
  Clock3,
  BookOpen,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useStudy } from "./study-context";
import { PlanFields } from "./plan-fields";
import { profileSchema, type Profile } from "@/lib/model";
import { today, updateSettings, grade } from "@/lib/engine";
import { assessmentQuestions } from "@/lib/content";
export function Assessment({
  initial = false,
  onFinish,
}: {
  initial?: boolean;
  onFinish?: () => void;
}) {
  const { update, notify, fail } = useStudy();
  const router = useRouter();
  const [answers, setAnswers] = useState<number[]>([]),
    [score, setScore] = useState<number | null>(null),
    [busy, setBusy] = useState(false);
  async function finish(skip = false) {
    if (busy) return;
    setBusy(true);
    try {
      const result = skip
        ? null
        : grade(
            answers,
            assessmentQuestions.map((q) => q.correct),
          );
      await update((s) => ({
        ...s,
        profile: {
          ...s.profile,
          onboarded: skip || !initial || s.profile.onboarded,
        },
        assessments:
          result === null
            ? s.assessments
            : [
                ...s.assessments,
                {
                  id: crypto.randomUUID(),
                  date: today(),
                  answers,
                  score: result,
                  note: "4 道原创词汇、语法与阅读题；仅为起点参考，未覆盖听说写，不是 CEFR 或官方考试测评。",
                },
              ],
      }));
      if (skip) {
        onFinish?.();
        router.push("/today");
      } else {
        setScore(result);
        notify("评估已保存在本地");
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="assessment-wrap">
      <div className="eyebrow">A LITTLE CHECK-IN</div>
      <h1>了解你的起点</h1>
      <p className="muted">
        4 道原创基础题，不预设你的水平。结果用于课程参考，不换算雅思或托福成绩。
      </p>
      {score === null ? (
        <>
          <div className="panel quiz">
            {assessmentQuestions.map((q, i) => (
              <fieldset key={q.prompt}>
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
                      name={`assessment-${i}`}
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
              </fieldset>
            ))}
          </div>
          <div className="actions">
            <button
              className="button primary"
              disabled={
                busy ||
                answers.filter((a) => a !== undefined).length !==
                  assessmentQuestions.length
              }
              onClick={() => void finish()}
            >
              保存评估结果 <Check size={16} />
            </button>
            {initial && (
              <button
                className="button ghost"
                disabled={busy}
                onClick={() => void finish(true)}
              >
                暂缓评估，开始学习
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="panel result" data-testid="assessment-result">
          <div className="result-score">
            {Math.round(score * 100)}
            <small>%</small>
          </div>
          <h2>起点已记录，接下来一起练习。</h2>
          <p>
            当前只检查词汇、语法与阅读基础；听力、口语和写作仍待评估。题目较少，不能据此判定完整
            CEFR 等级。
          </p>
          {assessmentQuestions.map((q, i) => (
            <p key={i}>
              <strong>
                {answers[i] === q.correct ? "✓" : "·"} {q.prompt}
              </strong>
              <br />
              {q.explanation}
            </p>
          ))}
          <button
            className="button primary"
            onClick={() => {
              void update((s) => ({
                ...s,
                profile: { ...s.profile, onboarded: true },
              }))
                .then(() => {
                  onFinish?.();
                  router.push("/today");
                })
                .catch(fail);
            }}
          >
            进入今日学习 <ArrowUpRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
export function Onboarding() {
  const { state, update, fail } = useStudy();
  const [stage, setStage] = useState(0);
  const [profile, setProfile] = useState<Profile>(state.profile);
  const [settings, setSettings] = useState(state.settings);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const p = profileSchema.parse({ ...profile, startDate: today() });
      if (p.examDate < today()) throw new Error("考试日期应为今天或未来日期");
      await update((s) => ({
        ...updateSettings(s, settings, today()),
        profile: p,
      }));
      setStage(1);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="onboarding">
      <div className="onboarding-brand">
        <span className="brand-mark">
          <Compass size={24} />
        </span>
        EnglishPilot <span className="beta">PERSONAL LEARNING SPACE</span>
      </div>
      {stage === 1 ? (
        <Assessment initial />
      ) : (
        <div className="onboarding-grid">
          <div className="onboarding-intro">
            <span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
            <h1>
              从今天开始，
              <br />
              让英语稳步向前。
            </h1>
            <p>
              把远大的目标，变成每天可完成的小事。
              <br />
              一个为你准备的英语学习空间。
            </p>
            <div className="intro-points">
              <span>
                <Clock3 size={20} />
                每天 120 分钟，均衡练习
              </span>
              <span>
                <BookOpen size={20} />
                雅思与托福目标，独立追踪
              </span>
              <span>
                <ShieldCheck size={20} />
                记录保存在你的设备，无需登录
              </span>
            </div>
            <div className="intro-foot">365 DAYS · ONE STEP AT A TIME</div>
          </div>
          <form
            className="panel onboarding-form"
            onSubmit={(e) => void save(e)}
          >
            <span className="eyebrow">01 / 02 · 你的学习目标</span>
            <h2>先定一个适合你的节奏</h2>
            <div className="form-grid">
              <label>
                你的称呼
                <input
                  maxLength={40}
                  value={profile.name}
                  onChange={(e) =>
                    setProfile({ ...profile, name: e.target.value })
                  }
                />
              </label>
              <label>
                学习模式
                <select
                  value={profile.mode}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      mode: e.target.value as Profile["mode"],
                    })
                  }
                >
                  <option value="dual">雅思 + 托福双考试</option>
                  <option value="ielts">IELTS Academic</option>
                  <option value="toefl">TOEFL iBT 2026</option>
                </select>
              </label>
              <label>
                预计考试日期
                <input
                  type="date"
                  min={today()}
                  value={profile.examDate}
                  onChange={(e) =>
                    setProfile({ ...profile, examDate: e.target.value })
                  }
                />
              </label>
              <label>
                每周学习天数
                <select
                  value={settings.weeklyDays}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      weeklyDays: Number(e.target.value),
                    })
                  }
                >
                  {[7, 6, 5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} 天（从周一开始安排）
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="goal-pills">
              <span>
                IELTS <strong>6.5</strong>
              </span>
              <span>
                TOEFL 2026 <strong>5.0</strong>
              </span>
              <small>可在设置中分别调整</small>
            </div>
            <PlanFields
              total={settings.dailyMinutes}
              base={settings.base}
              onTotal={(dailyMinutes) =>
                setSettings({ ...settings, dailyMinutes })
              }
              onBase={(base) => setSettings({ ...settings, base })}
            />
            <label className="check-label">
              <input
                type="checkbox"
                checked={settings.adaptive}
                onChange={(e) =>
                  setSettings({ ...settings, adaptive: e.target.checked })
                }
              />
              每周根据真实练习，自适应调整配额
            </label>
            <button
              className="button primary full"
              type="submit"
              disabled={busy}
            >
              保存目标，开始基础评估 <ArrowUpRight size={18} />
            </button>
            <p className="small muted">不需要 API Key。你可以随时修改计划。</p>
          </form>
        </div>
      )}
    </main>
  );
}
