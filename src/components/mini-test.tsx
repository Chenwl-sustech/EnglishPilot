"use client";
import { Suspense, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { today } from "@/lib/engine";
import { curriculumLevels } from "@/lib/curriculum";
import type { State } from "@/lib/model";
import type { PracticeSession } from "@/lib/practice-model";
import {
  itemAnswered,
  practiceSummary,
  startWeekly,
  startWeeklyRetake,
} from "@/lib/practice";
import { useStudy } from "./study-context";
import { PracticeWorkspace } from "./practice-workspace";
import { PageHeading } from "./exercises";

type Exam = PracticeSession["exam"];
type Level = PracticeSession["level"];
type NewTest = { exam: Exam; level: Level; minutes: number };
const statusLabels: Record<PracticeSession["status"], string> = {
  "in-progress": "进行中",
  completed: "已交卷",
  abandoned: "已中止",
};

function requestedSession(s: State, id: string, taskId: string | null) {
  const retake = taskId
    ? s.extension.practiceSessions
        .filter(
          (p) =>
            p.kind === "weekly" &&
            p.scheduledTaskId === taskId &&
            p.retakeOf &&
            p.status === "in-progress",
        )
        .at(-1)
    : undefined;
  return (
    retake ??
    s.extension.practiceSessions.find((p) => p.id === id && p.kind === "weekly")
  );
}

function testHref(id: string) {
  return `/mini-test?exercise=${encodeURIComponent(id)}`;
}

export function MiniTest() {
  return (
    <Suspense fallback={<p role="status">正在读取小测与历史…</p>}>
      <MiniTestContent />
    </Suspense>
  );
}

function MiniTestContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { update, state } = useStudy();
  const exercise = searchParams.get("exercise");
  const taskId = searchParams.get("task");
  const routeKey = `${taskId ?? ""}|${exercise ?? ""}`;
  const session = exercise
    ? requestedSession(state, exercise, taskId)
    : undefined;
  const hasSession = !!session;
  const opening = useRef(new Map<string, Promise<void>>());
  const actionInFlight = useRef(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState("");
  const [navigating, startNavigation] = useTransition();
  const [openError, setOpenError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [actionError, setActionError] = useState<{
    key: string;
    message: string;
  } | null>(null);

  const scheduledRetakeId = taskId && session?.retakeOf ? session.id : null;
  useEffect(() => {
    if (scheduledRetakeId) router.replace(testHref(scheduledRetakeId));
  }, [scheduledRetakeId, router]);

  useEffect(() => {
    if (!exercise || hasSession) return;
    let active = true;
    let request = opening.current.get(routeKey);
    if (!request) {
      request = update(
        (s) => {
          if (requestedSession(s, exercise, taskId)) return s;
          const task = s.extension.tasks.find(
            (t) =>
              t.type === "mini-test" &&
              t.exerciseId === exercise &&
              (taskId ? t.id === taskId : t.scheduledDate === today()),
          );
          return startWeekly(
            s,
            exercise,
            new Date(),
            task?.estimatedMinutes ?? 10,
          );
        },
        { silent: true },
      );
      opening.current.set(routeKey, request);
    }
    void request.then(
      () => opening.current.delete(routeKey),
      (e: unknown) => {
        if (active)
          setOpenError({
            key: routeKey,
            message: e instanceof Error ? e.message : "无法准备小测，请重试。",
          });
      },
    );
    return () => {
      active = false;
    };
  }, [exercise, taskId, routeKey, hasSession, update, retry]);

  async function changeAndOpen(
    action: string,
    change: (s: State) => { next: State; id: string },
  ) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(action);
    setActionError(null);
    const origin = window.location.pathname + window.location.search;
    try {
      let id = "";
      await update(
        (s) => {
          const result = change(s);
          id = result.id;
          return result.next;
        },
        { silent: true },
      );
      if (window.location.pathname + window.location.search === origin)
        startNavigation(() => router.push(testHref(id)));
    } catch (e) {
      if (window.location.pathname + window.location.search === origin)
        setActionError({
          key: routeKey,
          message: e instanceof Error ? e.message : "小测准备失败，请重试。",
        });
    } finally {
      actionInFlight.current = false;
      setBusy("");
    }
  }

  function start({ exam, level, minutes }: NewTest) {
    const id = `mini:manual:${crypto.randomUUID()}`;
    const now = new Date();
    return changeAndOpen("new", (s) => ({
      next: startWeekly(s, id, now, minutes, { exam, level }),
      id,
    }));
  }

  function retake(parentId: string) {
    const now = new Date();
    return changeAndOpen(parentId, (s) => {
      const next = startWeeklyRetake(s, parentId, now);
      const paper = next.extension.practiceSessions
        .filter((p) => p.retakeOf === parentId && p.status === "in-progress")
        .at(-1);
      if (!paper) throw new Error("未能准备重测试卷，请重试。");
      return { next, id: paper.id };
    });
  }

  const error = actionError?.key === routeKey ? actionError.message : "";
  if (exercise) {
    if (!session) {
      const message = openError?.key === routeKey ? openError.message : "";
      return (
        <section className="panel">
          <button
            className="back-button"
            onClick={() => router.push("/mini-test")}
          >
            返回小测与历史
          </button>
          {message ? (
            <>
              <p role="alert">{message}</p>
              <button
                className="button secondary"
                onClick={() => {
                  opening.current.delete(routeKey);
                  setOpenError(null);
                  setRetry((n) => n + 1);
                }}
              >
                重新准备小测
              </button>
            </>
          ) : (
            <p role="status">正在准备小测试卷…</p>
          )}
        </section>
      );
    }
    const existingRetake = state.extension.practiceSessions.some(
      (p) => p.retakeOf === session.id && p.status === "in-progress",
    );
    return (
      <>
        <PracticeWorkspace
          key={session.id}
          sessionId={session.id}
          onClose={() => router.push("/mini-test")}
        />
        {session.status !== "in-progress" && (
          <section className="panel">
            <h2>再练一次，看看进步</h2>
            <p className="muted">
              本次试卷和答案已保留。另测一套沿用相同考试、级别与时长。
            </p>
            {error && <p role="alert">{error}</p>}
            <button
              className="button primary"
              disabled={!!busy || navigating}
              onClick={() => void retake(session.id)}
            >
              {busy || navigating
                ? "正在准备试卷…"
                : existingRetake
                  ? "继续重测"
                  : "另测一套"}
            </button>
          </section>
        )}
      </>
    );
  }

  return (
    <MiniTestHub
      busy={busy || (navigating ? "navigation" : "")}
      error={error}
      onStart={start}
      onRetake={retake}
    />
  );
}

function MiniTestHub({
  busy,
  error,
  onStart,
  onRetake,
}: {
  busy: string;
  error: string;
  onStart: (options: NewTest) => Promise<void>;
  onRetake: (id: string) => Promise<void>;
}) {
  const { state } = useStudy();
  const [exam, setExam] = useState<Exam>(
    state.profile.mode === "dual" ? state.profile.primary : state.profile.mode,
  );
  const [level, setLevel] = useState<Level>(
    state.extension.studyLevel === "all"
      ? "intermediate"
      : state.extension.studyLevel,
  );
  const [minutes, setMinutes] = useState("10");
  const [examFilter, setExamFilter] = useState<"all" | Exam>("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | PracticeSession["status"]
  >("all");
  const sessions = state.extension.practiceSessions.filter(
    (p) => p.kind === "weekly",
  );
  const filtered = [...sessions]
    .reverse()
    .filter(
      (p) =>
        (examFilter === "all" || p.exam === examFilter) &&
        (statusFilter === "all" || p.status === statusFilter),
    );

  return (
    <>
      <PageHeading
        eyebrow="MINI TESTS & HISTORY"
        title="用一套小测，找到下一步重点。"
        description="按考试与级别练习词汇语法、阅读和听力。每次试卷与答案都会保留，可随时回顾。"
      />
      <section className="panel">
        <h2>开始一套小测</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onStart({ exam, level, minutes: Number(minutes) });
          }}
        >
          <div className="form-grid three">
            <label>
              小测考试
              <select
                value={exam}
                disabled={!!busy}
                onChange={(e) => setExam(e.target.value as Exam)}
              >
                <option value="ielts">IELTS Academic</option>
                <option value="toefl">TOEFL iBT 2026</option>
              </select>
            </label>
            <label>
              小测训练级别
              <select
                value={level}
                disabled={!!busy}
                onChange={(e) => setLevel(e.target.value as Level)}
              >
                {curriculumLevels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              小测时长（分钟）
              <input
                type="number"
                min={10}
                max={30}
                step={1}
                required
                value={minutes}
                disabled={!!busy}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </label>
          </div>
          <p className="muted">
            自主新测为额外练习，不会追加日程任务或增加今日计划预算。
          </p>
          {error && <p role="alert">{error}</p>}
          <button className="button primary" type="submit" disabled={!!busy}>
            {busy === "new" ? "正在准备试卷…" : "开始新小测"}
          </button>
        </form>
      </section>
      <section className="panel" aria-label="小测历史">
        <h2>小测历史 · {sessions.length}</h2>
        <div className="form-grid">
          <label>
            历史考试
            <select
              value={examFilter}
              onChange={(e) =>
                setExamFilter(e.target.value as typeof examFilter)
              }
            >
              <option value="all">全部考试</option>
              <option value="ielts">IELTS</option>
              <option value="toefl">TOEFL</option>
            </select>
          </label>
          <label>
            历史状态
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as typeof statusFilter)
              }
            >
              <option value="all">全部状态</option>
              <option value="in-progress">进行中</option>
              <option value="completed">已交卷</option>
              <option value="abandoned">已中止</option>
            </select>
          </label>
        </div>
        {!filtered.length ? (
          <p className="muted">
            {sessions.length
              ? "没有符合筛选条件的小测。"
              : "暂无小测记录。开始后可从这里继续作答或查看结果。"}
          </p>
        ) : (
          <div className="lesson-grid" style={{ marginTop: 20 }}>
            {filtered.map((p) => {
              const result = practiceSummary(p);
              const items = p.sections.flatMap((section) => section.items);
              const answered = items.filter((item) =>
                itemAnswered(p, item),
              ).length;
              const existingRetake = sessions.some(
                (other) =>
                  other.retakeOf === p.id && other.status === "in-progress",
              );
              return (
                <article
                  className="panel"
                  data-testid="mini-history-item"
                  key={p.id}
                >
                  <div className="tags">
                    <span>{statusLabels[p.status]}</span>
                    <span>
                      {p.retakeOf
                        ? "重测"
                        : p.scheduledTaskId
                          ? "日程小测"
                          : "自主小测"}
                    </span>
                  </div>
                  <h3>
                    {p.exam.toUpperCase()} ·{" "}
                    {curriculumLevels.find((l) => l.id === p.level)?.label}
                  </h3>
                  <p className="small muted">
                    <time dateTime={p.createdAt}>
                      {p.date}{" "}
                      {new Date(p.createdAt).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </time>
                    {" · "}
                    {Math.round(
                      p.sections.reduce(
                        (sum, section) => sum + section.limitSeconds,
                        0,
                      ) / 60,
                    )}{" "}
                    分钟
                  </p>
                  <p>
                    已答 {answered}/{items.length} 题
                  </p>
                  <p className="small muted">
                    {result.objectiveCount
                      ? `客观题 ${result.correct}/${result.objectiveCount} · 正确率 ${Math.round((result.correct / result.objectiveCount) * 100)}%`
                      : "交卷后查看正确率与逐题解析"}
                  </p>
                  <div className="actions" style={{ flexWrap: "wrap" }}>
                    <Link className="button secondary" href={testHref(p.id)}>
                      {p.status === "in-progress" ? "继续小测" : "查看结果"}
                    </Link>
                    {p.status !== "in-progress" && (
                      <button
                        className="text-button"
                        disabled={!!busy}
                        onClick={() => void onRetake(p.id)}
                      >
                        {busy === p.id
                          ? "正在准备…"
                          : existingRetake
                            ? "继续重测"
                            : "另测一套"}
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
