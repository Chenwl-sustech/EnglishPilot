"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Play,
  Pause,
  ArrowUpRight,
  SkipForward,
  RotateCcw,
  Check,
  CalendarDays,
} from "lucide-react";
import { useStudy } from "./study-context";
import { chinaDate } from "@/lib/calendar";
import {
  ensureAdaptiveDay,
  recoveryPreview,
  taskAction,
  taskTypeLabels,
  taskUrl,
} from "@/lib/scheduler";
export function DynamicTaskList() {
  const { state, update, notify, fail } = useStudy();
  const [preview, setPreview] = useState(false);
  const date = chinaDate();
  const budget = state.extension.budgets.find((b) => b.date === date);
  const tasks = state.extension.tasks.filter(
    (t) =>
      t.scheduledDate === date && !["cancelled", "deferred"].includes(t.status),
  );
  const actual = state.attempts
    .filter((a) => a.date === date)
    .reduce((n, a) => n + a.seconds, 0);
  const planned = tasks.reduce((n, t) => n + t.estimatedMinutes, 0);
  const completed = tasks
    .filter((t) => t.status === "done")
    .reduce((n, t) => n + t.estimatedMinutes, 0);
  const remaining = tasks
    .filter((t) => ["pending", "running", "paused"].includes(t.status))
    .reduce((n, t) => n + t.estimatedMinutes, 0);
  const proposed = preview
    ? ensureAdaptiveDay(state, date, true).extension.tasks.filter(
        (t) =>
          t.scheduledDate === date &&
          !["cancelled", "deferred"].includes(t.status),
      )
    : [];
  const recovery = recoveryPreview(state, date);
  async function action(
    id: string,
    a: "start" | "pause" | "continue" | "finish" | "skip",
  ) {
    try {
      await update((s) => taskAction(s, id, a));
    } catch (e) {
      fail(e);
    }
  }
  async function reschedule() {
    try {
      await update((s) => ensureAdaptiveDay(s, date, true));
      setPreview(false);
      notify("任务已按优先级重排，历史和复习状态保留");
    } catch (e) {
      fail(e);
    }
  }
  return (
    <section className="panel dynamic-panel">
      <div className="section-line">
        <div>
          <span className="eyebrow">TODAY · SMART TASK QUEUE</span>
          <h2>今日动态任务</h2>
        </div>
        <Link className="text-link" href="/calendar">
          <CalendarDays size={15} />
          学习日历
        </Link>
      </div>
      <div className="budget-summary">
        <span>
          计划 <strong data-testid="dynamic-planned">{planned}</strong> 分钟
        </span>
        <span>已完成配额 {completed} 分钟</span>
        <span>剩余配额 {remaining} 分钟</span>
        <span>
          真实学习 {Math.floor(actual / 60)} 分 {actual % 60} 秒
        </span>
        <span>{tasks.length} 个任务</span>
      </div>
      <p className="small muted">
        {budget?.reason} · 当日预算 {budget?.limit ?? 0} 分钟 · 硬上限 2B ={" "}
        {budget?.hardLimit ?? 2 * state.settings.dailyMinutes}{" "}
        分钟。复习、周测和积压均包含在内。
      </p>
      {budget?.rest && (
        <p className="soft-note">
          今天是计划休息日。可选复习不影响完成率或计划合规连续日；完全休息也合规。
        </p>
      )}
      <div className="dynamic-tasks">
        {tasks.map((t) => (
          <div
            key={t.id}
            className={`dynamic-task ${t.status === "done" ? "is-done" : ""}`}
          >
            <span className={`priority priority-${t.priority}`}>
              P{t.priority}
            </span>
            <div className="dynamic-task-copy">
              <strong>
                {taskTypeLabels[t.type]}{" "}
                <small>{t.optional ? "可选" : ""}</small>
                <small>
                  {" "}
                  ·{" "}
                  {
                    (
                      {
                        pending: "待开始",
                        running: "进行中",
                        paused: "已暂停",
                        skipped: "已跳过",
                        done: "已完成",
                        cancelled: "已取消",
                        deferred: "已重排",
                      } as const
                    )[t.status]
                  }
                </small>
              </strong>
              <span>
                {state.extension.listeningMaterials.find(
                  (m) => m.id === t.exerciseId,
                )?.title ?? t.exerciseId}{" "}
                · {t.difficulty} · {t.estimatedMinutes} 分钟 · 已练{" "}
                {Math.floor(t.actualSeconds / 60)}分{t.actualSeconds % 60}秒
              </span>
              {(t.rescheduleCount > 0 ||
                t.exerciseId.startsWith("listening:")) && (
                <small>
                  {t.rescheduleCount > 0
                    ? `已顺延 ${t.rescheduleCount} 次 · `
                    : ""}
                  {t.reason}
                </small>
              )}
            </div>
            <div className="task-controls">
              {t.status === "done" ? (
                <span className="done-label">
                  <Check size={14} />
                  已提交
                </span>
              ) : (
                <>
                  <button
                    className="icon-button"
                    aria-label={`${t.status === "running" ? "暂停" : "继续"}任务 ${t.id}`}
                    onClick={() =>
                      void action(
                        t.id,
                        t.status === "running" ? "pause" : "continue",
                      )
                    }
                  >
                    {t.status === "running" ? (
                      <Pause size={15} />
                    ) : (
                      <Play size={15} />
                    )}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`跳过任务 ${t.id}`}
                    onClick={() => void action(t.id, "skip")}
                  >
                    <SkipForward size={15} />
                  </button>
                  <Link
                    className="button secondary compact"
                    href={taskUrl(t)}
                    onClick={() => void action(t.id, "start")}
                  >
                    进入练习 <ArrowUpRight size={14} />
                  </Link>
                </>
              )}
            </div>
          </div>
        ))}
        {!tasks.length && (
          <p className="muted">今天没有必修任务，休息或自愿复习均可。</p>
        )}
      </div>
      <div className="section-line recovery-line">
        <p className="small muted">
          {state.extension.recoveries.find((r) => r.date === date)?.reason}
        </p>
        <button className="text-button" onClick={() => setPreview(!preview)}>
          <RotateCcw size={14} />
          重新安排我的学习计划
        </button>
      </div>
      {preview && (
        <div className="import-preview">
          <h3>重排预览</h3>
          <p>
            今日计划：{tasks.length} 项 / {planned} 分钟 → {proposed.length} 项
            / {proposed.reduce((n, t) => n + t.estimatedMinutes, 0)} 分钟。
          </p>
          <p>
            当前积压 {recovery.beforeCount} 项、{recovery.beforeMinutes}{" "}
            分钟；恢复方式：{recovery.mode}。重排后自动任务不超过{" "}
            {recovery.budget.limit} 分钟。
          </p>
          <p>
            优先保留：{recovery.focus.join("、")}
            。重复知识点合并，低优先级任务可以取消日程但保留记录；不会删除 FSRS
            卡片。
          </p>
          <div className="actions">
            <button
              className="button primary"
              onClick={() => void reschedule()}
            >
              按此规则重新安排
            </button>
            <button
              className="button secondary"
              onClick={() => setPreview(false)}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
