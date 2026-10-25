"use client";
import { useState } from "react";
import { startMock, abandonPractice, practiceSummary } from "@/lib/practice";
import { budgetForState } from "@/lib/scheduler";
import { today } from "@/lib/engine";
import { curriculumLevels } from "@/lib/curriculum";
import type { PracticeSession } from "@/lib/practice-model";
import { PageHeading } from "./exercises";
import { useStudy } from "./study-context";
import { PracticeWorkspace } from "./practice-workspace";
export function MockExams() {
  const { state, update, fail } = useStudy();
  const resumable = state.extension.practiceSessions
    .filter((s) => s.kind === "mock" && s.status === "in-progress")
    .at(-1);
  const [exam, setExam] = useState<"ielts" | "toefl">(
      resumable?.exam ??
        (state.profile.mode === "dual"
          ? state.profile.primary
          : state.profile.mode),
    ),
    [level, setLevel] = useState<PracticeSession["level"]>(
      resumable?.level ??
        (state.extension.studyLevel === "all"
          ? "intermediate"
          : state.extension.studyLevel),
    ),
    [active, setActive] = useState(""),
    [busy, setBusy] = useState(false);
  const sessions = state.extension.practiceSessions.filter(
      (s) => s.kind === "mock",
    ),
    budget = budgetForState(state, today());
  async function start() {
    setBusy(true);
    try {
      let chosen = "";
      await update((s) => {
        const next = startMock(s, exam, level);
        chosen = next.extension.practiceSessions.find(
          (p) =>
            p.kind === "mock" && p.exam === exam && p.status === "in-progress",
        )!.id;
        return next;
      });
      setActive(chosen);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function abandon(id: string) {
    if (
      !window.confirm(
        "中止本次模考？已保存的答案、练习结果和录音会保留，可开始另一套试卷。",
      )
    )
      return;
    try {
      await update((s) => abandonPractice(s, id));
    } catch (e) {
      fail(e);
    }
  }
  if (active)
    return (
      <PracticeWorkspace sessionId={active} onClose={() => setActive("")} />
    );
  return (
    <>
      <PageHeading
        eyebrow="FOUR-SKILL PRACTICE EXAMS"
        title="完整走一遍，找到下一步重点。"
        description="独立 IELTS Academic / TOEFL 2026 四项流程 · 分节计时 · 自动保存 · 本地录音 · 答案解析"
      />
      <section className="panel">
        <h2>开始一套原创模考</h2>
        <div className="form-grid">
          <label>
            模考考试
            <select
              value={exam}
              onChange={(e) => setExam(e.target.value as typeof exam)}
            >
              <option value="ielts">IELTS Academic</option>
              <option value="toefl">TOEFL iBT 2026</option>
            </select>
          </label>
          <label>
            模考训练级别
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as typeof level)}
            >
              {curriculumLevels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p>
          {exam === "ielts"
            ? "听力40题 / 30分钟 → 阅读40题 / 60分钟 → 写作2篇 / 60分钟 → 口语3部分 / 13分钟。"
            : "阅读50题 / 30分钟 → 听力47题 / 29分钟 → 写作12题 / 23分钟 → 口语11题 / 8分钟。"}
        </p>
        <p className="muted">
          优先选择所选级别，完整试卷会补入其他级别以满足题量。听力采用本机合成音频；部分理解题以单选形式练习，材料长度和交互未完全复现官方考试。TOEFL采用固定基础题量，未实现官方自适应路由。IELTS口语在本次流程最后进行，正式考试可能另行安排。
        </p>
        <p>
          今日自动计划上限 {budget.limit} 分钟，硬上限 {budget.hardLimit}{" "}
          分钟。完整模考约 {exam === "ielts" ? 163 : 90}{" "}
          分钟，不会自动追加到今日任务；点击开始是自愿额外练习，会保留实际分节用时。
        </p>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void start()}
        >
          {busy
            ? "正在准备试卷…"
            : sessions.some(
                  (s) => s.exam === exam && s.status === "in-progress",
                )
              ? "继续未完成模考"
              : "开始完整四项模考"}
        </button>
        <p className="small muted">
          原创内容 · CC BY 4.0 ·
          未校准题库。正确率不换算官方分数，写作AI批改需单独发起并受调用额度限制。
        </p>
      </section>
      <section className="panel">
        <h2>模考历史 · {sessions.length}</h2>
        {!sessions.length ? (
          <p className="muted">
            暂无模考记录。开始后会保存固定试卷，刷新或返回时可以继续。
          </p>
        ) : (
          <div className="lesson-grid">
            {[...sessions].reverse().map((s) => {
              const r = practiceSummary(s);
              return (
                <article key={s.id}>
                  <h3>
                    {s.exam.toUpperCase()} · {s.date}
                  </h3>
                  <p>
                    {s.status === "in-progress"
                      ? "进行中"
                      : s.status === "completed"
                        ? "已交卷"
                        : "已中止"}{" "}
                    · 已交 {s.results.length}/{s.sections.length} 节 · 客观题{" "}
                    {r.correct}/{r.objectiveCount}
                  </p>
                  <div className="actions">
                    <button
                      className="button secondary"
                      onClick={() => setActive(s.id)}
                    >
                      {s.status === "in-progress" ? "继续模考" : "查看记录"}
                    </button>
                    {s.status === "in-progress" && (
                      <button
                        className="text-button"
                        onClick={() => void abandon(s.id)}
                      >
                        中止并保留记录
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
