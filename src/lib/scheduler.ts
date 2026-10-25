import type { Attempt, State, Skill } from "./model";
import { type DynamicTask, type Extension, fourSkills } from "./adaptive-model";
import {
  calendarDays,
  chinaDate,
  classifyDate,
  shiftDate,
  timeBudget,
  type DailyTimeBudget,
} from "./calendar";
import { readings, writingPrompts, speakingPrompts } from "./content";
import { selectLearningLesson } from "./learning-library";
import { vocabularyEntries } from "./vocabulary";
import { isVocabularyLearnable } from "./open-vocabulary";
import { rankDueReviews, isFsrsDue, forgettingRisk } from "./fsrs";
import { readingTarget } from "./reading-target";
import {
  selectImportedListeningTarget,
  bindImportedListeningTasks,
} from "./listening-target";

const inactive = new Set(["cancelled", "deferred", "skipped"]);
export const taskTypeLabels: Record<DynamicTask["type"], string> = {
  "new-vocabulary": "新词学习",
  "fsrs-review": "FSRS 到期复习",
  grammar: "基础语法",
  listening: "听力理解",
  dictation: "逐句听写",
  shadowing: "影子跟读",
  reading: "阅读训练",
  writing: "写作练习",
  speaking: "口语练习",
  "error-review": "错题复习",
  "mini-test": "阶段小测",
  "mock-exam": "模拟考试",
};
export function budgetForState(s: State, date: string): DailyTimeBudget {
  const e = s.extension;
  let budget = timeBudget(
    date,
    s.settings.dailyMinutes,
    e.calendarRules,
    e.calendarYears,
    e.overrides,
  );
  const weekly =
    [...s.scheduleHistory].filter((h) => h.from <= date).at(-1)?.weeklyDays ??
    s.settings.weeklyDays;
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  const day = classifyDate(date, e.calendarYears, e.overrides);
  if (
    weekday >= weekly &&
    !["makeup", "custom-intensive", "custom-workday"].includes(day.type)
  )
    budget = {
      ...budget,
      limit: Math.min(
        budget.hardLimit,
        e.calendarRules.restReviewMinutes,
        e.overrides[date]?.cap ?? Infinity,
      ),
      rest: true,
      optionalReview: e.calendarRules.restReviewMinutes,
      reason: budget.reason + " · 每周计划休息日",
    };
  const retained = e.tasks
      .filter(
        (t) =>
          t.scheduledDate === date && ["done", "skipped"].includes(t.status),
      )
      .reduce((n, t) => n + t.estimatedMinutes, 0),
    previous = e.budgets.find((b) => b.date === date);
  if (previous && retained > budget.limit)
    budget = {
      ...previous,
      limit: retained,
      rest: false,
      optionalReview: 0,
      reason:
        "今日已完成/跳过的历史计划保留；较低时长或休息规则从次日起生效，今日不再加课。",
    };
  return budget;
}
function dayTasks(e: Extension, date: string) {
  return e.tasks.filter(
    (t) => t.scheduledDate === date && !inactive.has(t.status),
  );
}
function task(
  s: State,
  date: string,
  type: DynamicTask["type"],
  skill: Skill,
  exerciseId: string,
  minutes: number,
  priority = 3,
  optional = false,
): DynamicTask {
  const day = Math.max(0, calendarDays(s.profile.startDate, date));
  const exam =
    s.profile.mode === "dual"
      ? day % 10 < s.profile.primaryShare / 10
        ? s.profile.primary
        : s.profile.primary === "ielts"
          ? "toefl"
          : "ielts"
      : s.profile.mode;
  return {
    id: `${date}:${type}:${exerciseId}`,
    type,
    skill,
    exerciseId,
    knowledgeKey: `${type}:${exerciseId}`,
    estimatedMinutes: Math.max(1, minutes),
    priority,
    difficulty: day < 90 ? "A1" : day < 180 ? "B1" : "B2",
    exam: ["grammar", "new-vocabulary", "fsrs-review", "error-review"].includes(
      type,
    )
      ? "shared"
      : exam,
    scheduledDate: date,
    originalDate: date,
    status: "pending",
    actualSeconds: 0,
    completionIds: [],
    rescheduleCount: 0,
    optional,
    reason: taskTypeLabels[type],
    startedAt: null,
  };
}
function split(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map(() => 0);
  const raw = weights.map((x) => (total * x) / sum),
    out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  for (const { i } of raw
    .map((n, i) => ({ i, frac: n % 1 }))
    .sort((a, b) => b.frac - a.frac))
    if (rest-- > 0) out[i]++;
  return out;
}
export function generateDailyTasks(s: State, date: string): DynamicTask[] {
  const e = s.extension,
    b = budgetForState(s, date);
  const learnable = vocabularyEntries(s).filter(isVocabularyLearnable);
  const learnableIds = new Set(learnable.map((word) => word.id));
  const due = rankDueReviews(
    e.fsrsReviews,
    date === chinaDate() ? new Date() : new Date(`${date}T23:59:59+08:00`),
  ).filter(([id]) => learnableIds.has(id));
  if (!b.limit) return [];
  if (b.rest) {
    const reviews = due
      .slice(0, b.limit)
      .map(([id]) =>
        task(s, date, "fsrs-review", "foundation", id, 1, 0, true),
      );
    let remaining = b.limit - reviews.length;
    for (const m of e.mistakes.filter((m) =>
      ["open", "reviewing"].includes(m.status),
    )) {
      if (remaining < 1) break;
      const cost = Math.min(3, remaining);
      reviews.push(
        task(s, date, "error-review", "foundation", m.id, cost, 1, true),
      );
      remaining -= cost;
    }
    return reviews;
  }
  const day = Math.max(0, calendarDays(s.profile.startDate, date));
  const items: DynamicTask[] = [];
  let available = b.limit;
  const foundation = Math.min(
    available,
    Math.max(
      1,
      Math.round(
        (s.settings.base.foundation * b.limit) / s.settings.dailyMinutes,
      ),
    ),
  );
  const reviewMinutes = Math.min(
    foundation,
    due.length,
    Math.ceil(b.limit * 0.25),
  );
  for (const [id] of due.slice(0, reviewMinutes))
    items.push(task(s, date, "fsrs-review", "foundation", id, 1, 0));
  const errors = e.mistakes
    .filter(
      (m) =>
        (m.status === "open" || m.status === "reviewing") &&
        (!m.fsrs || isFsrsDue(m.fsrs, new Date(`${date}T23:59:59+08:00`))),
    )
    .sort(
      (a, b) =>
        (b.fsrs ? forgettingRisk(b.fsrs) : 1) -
        (a.fsrs ? forgettingRisk(a.fsrs) : 1),
    );
  let extra = 0;
  if (errors.length && available - foundation >= 10) {
    extra = Math.min(8, Math.round(available * 0.06));
    items.push(
      task(s, date, "error-review", "foundation", errors[0].id, extra, 1),
    );
  }
  const mini =
    (e.calendarRules.weekendTest &&
      [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay()) &&
      available >= 60) ||
    b.intensive;
  let testMinutes = mini
    ? Math.min(20, Math.max(10, Math.floor(available * 0.1)))
    : 0;
  if (available - foundation - extra - testMinutes < 4) testMinutes = 0;
  if (testMinutes)
    items.push(
      task(
        s,
        date,
        "mini-test",
        "foundation",
        `mini:${Math.floor(day / 7)}:${date}`,
        testMinutes,
        2,
      ),
    );
  const newMinutes = foundation - reviewMinutes;
  if (newMinutes > 0) {
    const level =
      e.studyLevel === "all"
        ? day < 90
          ? "foundation"
          : day < 270
            ? "intermediate"
            : "advanced"
        : e.studyLevel;
    const vocabulary = learnable.filter(
      (w) =>
        ((e.studyLevel === "all" && day < 7) || w.level === level) &&
        !e.fsrsReviews[w.id]?.card.reps,
    );
    const isGrammar = day % 2 === 1 || !vocabulary.length;
    const id = isGrammar
      ? selectLearningLesson(s, "grammar", Math.floor(day / 2)).id
      : vocabulary[day % vocabulary.length].id;
    items.push(
      task(
        s,
        date,
        isGrammar ? "grammar" : "new-vocabulary",
        "foundation",
        id,
        newMinutes,
        3,
      ),
    );
  }
  available -= foundation + extra + testMinutes;
  const weights =
    e.allocationMode !== "base"
      ? fourSkills.map((k) => e.ratios[k])
      : fourSkills.map((k) => s.settings.effective[k]);
  const durations = split(Math.max(0, available), weights);
  fourSkills.forEach((skill, i) => {
    const n = durations[i];
    if (n < 1) return;
    let type: DynamicTask["type"] = skill;
    if (skill === "listening" && day % 3 === 1) type = "dictation";
    if (skill === "speaking" && day % 3 === 2) type = "shadowing";
    let exerciseId =
      type === "shadowing"
        ? selectLearningLesson(s, "listening", day).id
        : skill === "reading"
          ? readings[day % readings.length].id
          : skill === "listening"
            ? selectLearningLesson(s, "listening", day).id
            : skill === "writing"
              ? `writing-${day % writingPrompts.length}`
              : `speaking-${day % speakingPrompts.length}`;
    const exam = task(s, date, type, skill, exerciseId, n).exam;
    let weak: string | undefined;
    if (skill === "reading") {
      const target = readingTarget(
        s,
        date,
        exam === "shared" ? "ielts" : exam,
        day,
      );
      exerciseId = target.id;
      weak = target.weak;
    }
    const imported = ["listening", "dictation", "shadowing"].includes(type)
      ? selectImportedListeningTarget(
          s,
          date,
          exam === "shared" ? "ielts" : exam,
          type as "listening" | "dictation" | "shadowing",
          n,
        )
      : null;
    if (imported) exerciseId = imported.material.id;
    if (
      day >= 90 &&
      (skill === "writing" || skill === "speaking") &&
      type !== "shadowing"
    ) {
      const prompts = skill === "writing" ? writingPrompts : speakingPrompts;
      const indexes = prompts
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p[2].includes(exam.toUpperCase()));
      if (indexes.length)
        exerciseId = `${skill}-${indexes[day % indexes.length].i}`;
    }
    const item = task(
      s,
      date,
      type,
      skill,
      exerciseId,
      n,
      weak ? 2 : e.ratios[skill] >= 30 ? 2 : 3,
    );
    if (weak) item.reason += ` · 最近薄弱题型 ${weak}`;
    if (imported) item.reason += ` · ${imported.reason}`;
    items.push(item);
  });
  return items.sort(
    (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
  );
}
export function recoveryPreview(s: State, date = chinaDate()) {
  let missedDays = 0;
  for (let n = 1; n <= 365; n++) {
    const d = shiftDate(date, -n);
    if (d < s.profile.startDate) break;
    const b =
      s.extension.budgets.find((b) => b.date === d) ?? budgetForState(s, d);
    if (b.rest) continue;
    if (s.attempts.some((a) => a.date === d)) break;
    missedDays++;
  }
  const backlog = s.extension.tasks.filter(
    (t) =>
      t.scheduledDate < date &&
      ["pending", "paused", "running"].includes(t.status),
  );
  const mode =
    missedDays >= 4
      ? "recovery"
      : missedDays >= 2
        ? "compressed"
        : missedDays === 1
          ? "catch-up"
          : "normal";
  const budget = budgetForState(s, date);
  return {
    id: `recovery:${date}`,
    date,
    missedDays,
    mode: mode as "recovery" | "compressed" | "catch-up" | "normal",
    beforeCount: backlog.length,
    beforeMinutes: backlog.reduce((n, t) => n + t.estimatedMinutes, 0),
    afterCount: 0,
    afterMinutes: 0,
    focus:
      mode === "recovery"
        ? ["核心复习", "低负担弱项训练"]
        : ["到期复习", "当前弱项"],
    reason:
      mode === "recovery"
        ? `连续 ${missedDays} 个计划日缺课，进入恢复模式。先恢复习惯，暂停拓展新课。${calendarDays(date, s.profile.examDate) < 30 ? "距离考试不足 30 天，建议重新核对目标与考试日期。" : ""}`
        : mode === "compressed"
          ? "合并重复知识点，压缩新课与重复练习。"
          : mode === "catch-up"
            ? "优先顺延关键复习，非关键新课适度延后。"
            : "按当前节奏继续学习。",
    budget,
  };
}
export function ensureAdaptiveDay(
  state: State,
  date = chinaDate(),
  force = false,
): State {
  if (!state.profile.onboarded) return state;
  const learnableIds = new Set(vocabularyEntries(state).filter(isVocabularyLearnable).map((word) => word.id));
  const referenceTasks = new Set(state.extension.tasks.filter((task) =>
    ["new-vocabulary", "fsrs-review"].includes(task.type) &&
    ["pending", "paused", "running"].includes(task.status) &&
    !learnableIds.has(task.exerciseId),
  ).map((task) => task.id));
  if (referenceTasks.size) {
    state = { ...state, extension: {
      ...state.extension,
      selectedTaskId: referenceTasks.has(state.extension.selectedTaskId ?? "") ? null : state.extension.selectedTaskId,
      tasks: state.extension.tasks.map((task) => referenceTasks.has(task.id) ? {
        ...task, status: "cancelled" as const, startedAt: null,
        reason: task.reason + " · 词条暂无释义，已暂缓并保留历史用时",
      } : task),
    } };
    force = true;
  }
  const old = state.extension;
  if (!force && old.lastScheduleDate === date)
    return bindImportedListeningTasks(state, date);
  const e: Extension = {
    ...old,
    tasks: old.tasks.map((t) =>
      t.status === "running" ? { ...t, status: "paused", startedAt: null } : t,
    ),
    reschedules: [...old.reschedules],
    recoveries: [...old.recoveries],
  };
  const s = { ...state, extension: e },
    preview = recoveryPreview(s, date),
    budget = preview.budget;
  const completed = e.tasks.filter(
    (t) => t.scheduledDate === date && ["done", "skipped"].includes(t.status),
  );
  const protectedTasks: DynamicTask[] = [];
  let protectionBudget = Math.max(
    0,
    budget.limit - completed.reduce((n, t) => n + t.estimatedMinutes, 0),
  );
  for (const t of e.tasks.filter(
    (t) =>
      t.scheduledDate === date &&
      ["pending", "paused"].includes(t.status) &&
      (t.status === "paused" ||
        t.actualSeconds > 0 ||
        t.completionIds.length > 0 ||
        old.selectedTaskId === t.id),
  )) {
    const minutes = Math.min(t.estimatedMinutes, protectionBudget);
    if (minutes > 0) {
      protectedTasks.push({ ...t, estimatedMinutes: minutes });
      protectionBudget -= minutes;
    }
  }
  completed.push(...protectedTasks);
  const completedCost = completed.reduce((n, t) => n + t.estimatedMinutes, 0);
  let remaining = Math.max(0, budget.limit - completedCost);
  let fresh = generateDailyTasks(s, date).filter(
    (t) =>
      !completed.some((d) => d.knowledgeKey === t.knowledgeKey) &&
      !protectedTasks.some((d) => d.type === t.type && d.skill === t.skill),
  );
  if (preview.mode === "recovery") {
    remaining = Math.min(remaining, Math.round(budget.limit * 0.65));
    fresh = fresh
      .filter(
        (t) =>
          t.type !== "new-vocabulary" &&
          t.type !== "mini-test" &&
          t.priority < 4,
      )
      .map((t) => ({
        ...t,
        estimatedMinutes: Math.max(1, Math.round(t.estimatedMinutes * 0.7)),
        reason: t.reason + " · 逐步恢复",
      }));
  } else if (preview.mode === "compressed")
    fresh = fresh.map((t) =>
      t.type === "new-vocabulary"
        ? {
            ...t,
            estimatedMinutes: Math.max(1, Math.ceil(t.estimatedMinutes * 0.5)),
          }
        : t,
    );
  const backlog = e.tasks.filter(
    (t) =>
      t.scheduledDate < date &&
      ["pending", "paused", "running"].includes(t.status),
  );
  const merged = new Set<string>();
  const carried: DynamicTask[] = [];
  let carryBudget = Math.floor(remaining * 0.25);
  for (const t of e.tasks
    .filter(
      (t) =>
        t.scheduledDate === date &&
        t.rescheduleCount > 0 &&
        !completed.some((c) => c.id === t.id) &&
        ["pending", "paused"].includes(t.status),
    )
    .sort((a, b) => a.priority - b.priority)) {
    if (budget.rest || carryBudget <= 0) break;
    const cost = Math.min(t.estimatedMinutes, carryBudget);
    carried.push({ ...t, estimatedMinutes: cost });
    merged.add(t.knowledgeKey);
    carryBudget -= cost;
  }
  for (const t of backlog.sort(
    (a, b) =>
      a.priority - b.priority || a.originalDate.localeCompare(b.originalDate),
  )) {
    const duplicate =
      merged.has(t.knowledgeKey) ||
      completed.some((d) => d.knowledgeKey === t.knowledgeKey);
    const carry =
      t.priority <= 2 &&
      !duplicate &&
      carryBudget > 0 &&
      !budget.rest &&
      t.rescheduleCount < 7 &&
      t.type !== "fsrs-review";
    const action = carry
      ? "moved"
      : duplicate
        ? "merged"
        : t.priority >= 3
          ? "cancelled"
          : "deferred";
    e.reschedules.push({
      id: `${date}:${t.id}:${action}`,
      taskId: t.id,
      from: t.scheduledDate,
      to: carry ? date : null,
      action,
      reason: carry
        ? "保留关键复习/弱项，统一纳入今日预算"
        : "合并/暂缓日程；保留历史与卡片记忆状态",
      createdAt: new Date().toISOString(),
    });
    e.tasks = e.tasks.map((x) =>
      x.id === t.id
        ? {
            ...x,
            status: carry || duplicate ? "deferred" : "cancelled",
            startedAt: null,
          }
        : x,
    );
    if (carry) {
      const cost = Math.min(
        t.estimatedMinutes,
        preview.mode === "normal" ? 20 : 10,
        carryBudget,
      );
      carryBudget -= cost;
      merged.add(t.knowledgeKey);
      carried.push({
        ...t,
        id: `${date}:${t.type}:${t.exerciseId}`,
        scheduledDate: date,
        status: "pending",
        startedAt: null,
        rescheduleCount: t.rescheduleCount + 1,
        estimatedMinutes: cost,
        reason: "缺课恢复：" + t.reason,
      });
    }
  }
  fresh = fresh
    .filter((t) => !carried.some((c) => c.knowledgeKey === t.knowledgeKey))
    .map((t) => {
      const previous = e.tasks.find(
        (x) => x.id === t.id && ["pending", "paused"].includes(x.status),
      );
      return previous
        ? {
            ...t,
            originalDate: previous.originalDate,
            rescheduleCount: previous.rescheduleCount,
            actualSeconds: previous.actualSeconds,
            completionIds: previous.completionIds,
            status: previous.status,
          }
        : t;
    });
  const freshBudget = Math.max(
    0,
    remaining - carried.reduce((n, t) => n + t.estimatedMinutes, 0),
  );
  if (fresh.reduce((n, t) => n + t.estimatedMinutes, 0) > freshBudget) {
    const parts = split(
      freshBudget,
      fresh.map((t) => t.estimatedMinutes),
    );
    fresh = fresh
      .map((t, i) => ({ ...t, estimatedMinutes: parts[i] }))
      .filter((t) => t.estimatedMinutes > 0);
  }
  const candidates = [...carried, ...fresh]
    .filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i)
    .sort((a, b) => a.priority - b.priority);
  const selected: DynamicTask[] = [];
  for (const t of candidates) {
    if (remaining <= 0) break;
    const minutes = Math.min(t.estimatedMinutes, remaining);
    if (minutes > 0) {
      selected.push({ ...t, estimatedMinutes: minutes });
      remaining -= minutes;
    }
  }
  const currentIds = new Set([...selected, ...completed].map((t) => t.id));
  const retired = e.tasks.filter(
    (t) =>
      t.scheduledDate === date &&
      !currentIds.has(t.id) &&
      !["cancelled", "deferred"].includes(t.status),
  );
  for (const t of retired)
    e.reschedules.push({
      id: `${date}:${t.id}:replanned:${e.reschedules.length}`,
      taskId: t.id,
      from: date,
      to: null,
      action: "cancelled",
      reason: "同日预算/复习队列更新，保留被替换任务的日程记录",
      createdAt: new Date().toISOString(),
    });
  e.tasks = [
    ...e.tasks.filter(
      (t) =>
        t.scheduledDate !== date ||
        (!currentIds.has(t.id) && t.status === "cancelled"),
    ),
    ...completed,
    ...selected,
    ...retired.map((t) => ({
      ...t,
      status: "cancelled" as const,
      startedAt: null,
    })),
  ];
  e.tasks = Array.from(new Map(e.tasks.map((t) => [t.id, t])).values());
  e.budgets = [...e.budgets.filter((b) => b.date !== date), budget];
  const recovery = {
    ...preview,
    afterCount: selected.length + protectedTasks.length,
    afterMinutes: [...selected, ...protectedTasks].reduce(
      (n, t) => n + t.estimatedMinutes,
      0,
    ),
  };
  delete (recovery as Partial<typeof preview>).budget;
  e.recoveries = [...e.recoveries.filter((r) => r.date !== date), recovery];
  e.lastScheduleDate = date;
  const legacy = state.tasks.filter((t) => t.date !== date);
  const current = dayTasks(e, date);
  for (const skill of ["foundation", ...fourSkills] as Skill[]) {
    const children = current.filter((t) => t.skill === skill);
    if (children.length)
      legacy.push({
        id: `${date}:${skill}`,
        date,
        skill,
        minutes: children.reduce((n, t) => n + t.estimatedMinutes, 0),
        status: children.every((t) => t.status === "done") ? "done" : "pending",
      });
  }
  return bindImportedListeningTasks(
    { ...state, extension: e, tasks: legacy },
    date,
  );
}
export function taskAction(
  s: State,
  id: string,
  action: "start" | "pause" | "continue" | "finish" | "skip",
): State {
  const task = s.extension.tasks.find((t) => t.id === id);
  if (!task) throw new Error("任务不存在");
  if (action === "finish" && !task.completionIds.length)
    throw new Error("请先提交真实练习结果，再结束任务");
  const status =
    action === "start" || action === "continue"
      ? "running"
      : action === "pause"
        ? "paused"
        : action === "skip"
          ? "skipped"
          : "done";
  if (task.status === "done" && status !== "done") return s;
  return {
    ...s,
    extension: {
      ...s.extension,
      selectedTaskId: status === "running" ? id : s.extension.selectedTaskId,
      tasks: s.extension.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              startedAt: status === "running" ? new Date().toISOString() : null,
            }
          : status === "running" && t.status === "running"
            ? { ...t, status: "paused", startedAt: null }
            : t,
      ),
    },
  };
}
export function attachAttemptToSchedule(s: State, a: Attempt): State {
  const result: State = {
    ...s,
    extension: {
      ...s.extension,
      tasks: s.extension.tasks.map((t) => {
        if (
          t.scheduledDate !== a.date ||
          t.status === "done" ||
          inactive.has(t.status)
        )
          return t;
        const matches =
          (t.exerciseId === a.contentId &&
            (t.skill === a.skill || t.type === "error-review") &&
            (t.type !== "listening" || a.score !== null) &&
            (t.type !== "dictation" ||
              (a.score === null &&
                (!t.exerciseId.startsWith("listening:") ||
                  a.activity === "dictation"))) &&
            (t.type !== "shadowing" ||
              !t.exerciseId.startsWith("listening:") ||
              a.activity === "shadowing")) ||
          (t.type === "error-review" && a.contentId === "rest-review");
        return matches
          ? {
              ...t,
              status: "done",
              startedAt: null,
              completionIds: [...new Set([...t.completionIds, a.id])],
              actualSeconds: t.actualSeconds + a.seconds,
            }
          : t;
      }),
    },
  };
  if (result.extension.tasks.some((t) => t.scheduledDate === a.date))
    result.tasks = result.tasks.map((t) => {
      if (t.date !== a.date) return t;
      const children = result.extension.tasks.filter(
        (c) =>
          c.scheduledDate === a.date &&
          c.skill === t.skill &&
          !inactive.has(c.status),
      );
      return {
        ...t,
        status:
          children.length && children.every((c) => c.status === "done")
            ? "done"
            : "pending",
      };
    });
  return result;
}
export function taskUrl(t: DynamicTask): string {
  const route =
    t.type === "mini-test"
      ? "/mini-test"
      : t.type === "error-review"
        ? "/mistakes"
        : t.type === "new-vocabulary" || t.type === "fsrs-review"
          ? "/vocabulary"
          : t.type === "grammar"
            ? "/grammar"
            : t.type === "dictation" || t.type === "shadowing"
              ? "/listening"
              : `/${t.skill}`;
  const imported = /^listening:[a-f0-9]{64}:(?:ielts|toefl|general)$/.test(
    t.exerciseId,
  );
  return `${imported ? "/listening" : route}?task=${encodeURIComponent(t.id)}&exercise=${encodeURIComponent(t.exerciseId)}&mode=${encodeURIComponent(t.type)}${imported ? "&library=imported" : ""}`;
}
