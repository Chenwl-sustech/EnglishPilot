import {
  skills,
  settingsSchema,
  stateSchema,
  attemptSchema,
  type State,
  type Settings,
  type Allocation,
  type Attempt,
  type WordReview,
  type Profile,
  profileSchema,
  labels,
} from "./model";
import { defaultExtension } from "./adaptive-model";
import { chinaDate, shiftDate } from "./calendar";
import { attachAttemptToSchedule } from "./scheduler";
import { collectAttemptMistakes } from "./mistakes";

export function today(date = new Date()): string {
  return chinaDate(date);
}
export function addDays(date: string, n: number): string {
  return shiftDate(date, n);
}
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
      86400000,
  );
}
export const defaultAllocation: Allocation = {
  foundation: 21,
  listening: 26,
  reading: 26,
  speaking: 21,
  writing: 26,
};
export function defaultState(date = today()): State {
  return {
    version: 3,
    extension: defaultExtension(date),
    profile: {
      name: "学习者",
      onboarded: false,
      startDate: date,
      examDate: addDays(date, 364),
      mode: "dual",
      primary: "ielts",
      primaryShare: 70,
      ielts: 6.5,
      ieltsListening: 6.5,
      ieltsReading: 6.5,
      ieltsSpeaking: 6,
      ieltsWriting: 6,
      toeflLegacy: 95,
      toefl2026: 5,
      academic: true,
    },
    settings: {
      dailyMinutes: 120,
      base: { ...defaultAllocation },
      effective: { ...defaultAllocation },
      adaptive: true,
      theme: "light",
      weeklyDays: 7,
    },
    lastReviewDate: date,
    scheduleHistory: [{ from: date, weeklyDays: 7 }],
    attempts: [],
    tasks: [],
    reviews: {},
    weekly: [],
    drafts: {},
    assessments: [],
    favorites: [],
  };
}
export function scaleAllocation(total: number): Allocation {
  if (!Number.isInteger(total) || total < 30 || total > 360)
    throw new Error("每日时长应为 30–360 的整数");
  const raw = skills.map((k) => ({
    k,
    value: 5 + ((total - 25) * Math.max(0, defaultAllocation[k] - 5)) / 95,
  }));
  const result = Object.fromEntries(
    raw.map((x) => [x.k, Math.floor(x.value)]),
  ) as Allocation;
  let rest = total - Object.values(result).reduce((a, b) => a + b, 0);
  for (const x of [...raw].sort((a, b) => (b.value % 1) - (a.value % 1)))
    if (rest-- > 0) result[x.k]++;
  return result;
}
export function updateSettings(
  state: State,
  input: Settings,
  date = today(),
): State {
  const settings = settingsSchema.parse({
    ...input,
    effective: { ...input.base },
  });
  const baseChanged =
    JSON.stringify(settings.base) !== JSON.stringify(state.settings.base);
  const changed = baseChanged || settings.adaptive !== state.settings.adaptive;
  let scheduleHistory = state.scheduleHistory.length
    ? state.scheduleHistory
    : [
        {
          from: state.profile.startDate,
          weeklyDays: state.settings.weeklyDays,
        },
      ];
  if (settings.weeklyDays !== state.settings.weeklyDays) {
    const from = state.profile.onboarded ? addDays(date, 1) : date;
    scheduleHistory = [
      ...scheduleHistory.filter((h) => h.from !== from),
      { from, weeklyDays: settings.weeklyDays },
    ].sort((a, b) => a.from.localeCompare(b.from));
  }
  return {
    ...state,
    settings: {
      ...settings,
      effective: baseChanged ? settings.base : state.settings.effective,
    },
    scheduleHistory,
    lastReviewDate: changed ? date : state.lastReviewDate,
    tasks: baseChanged
      ? state.tasks.map((t) =>
          t.date === date ? { ...t, minutes: settings.base[t.skill] } : t,
        )
      : state.tasks,
    extension: {
      ...state.extension,
      lastScheduleDate: baseChanged ? null : state.extension.lastScheduleDate,
      allocationMode: baseChanged ? "base" : state.extension.allocationMode,
      lastAllocationDate: changed ? date : state.extension.lastAllocationDate,
    },
  };
}
export function commitPreferences(
  state: State,
  original: { settings: Settings; profile: Profile },
  desired: { settings: Settings; profile: Profile },
  date = today(),
): State {
  function merge<T extends object>(
    current: T,
    old: T,
    next: T,
    skip: string[] = [],
  ): T {
    const result = { ...current };
    for (const key of Object.keys(next) as (keyof T)[]) {
      if (
        skip.includes(String(key)) ||
        JSON.stringify(next[key]) === JSON.stringify(old[key])
      )
        continue;
      if (
        JSON.stringify(current[key]) !== JSON.stringify(old[key]) &&
        JSON.stringify(current[key]) !== JSON.stringify(next[key])
      )
        throw new Error(
          "其他窗口已修改同一设置。请刷新后重新编辑；当前保存未覆盖已有数据。",
        );
      result[key] = next[key];
    }
    return result;
  }
  return {
    ...updateSettings(
      state,
      merge(state.settings, original.settings, desired.settings, ["effective"]),
      date,
    ),
    profile: profileSchema.parse(
      merge(state.profile, original.profile, desired.profile),
    ),
  };
}
export function tasksForDate(state: State, date: string) {
  const saved = state.tasks.filter((t) => t.date === date);
  if (saved.length) return saved;
  const weekday = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
  const weeklyDays =
    [...state.scheduleHistory]
      .filter((h) => h.from <= date)
      .sort((a, b) => a.from.localeCompare(b.from))
      .at(-1)?.weeklyDays ?? state.settings.weeklyDays;
  if (weekday >= weeklyDays) return [];
  return skills.map((skill) => ({
    id: `${date}:${skill}`,
    date,
    skill,
    minutes: state.settings.effective[skill],
    status: "pending" as const,
  }));
}
export function adjustWeekly(state: State, date = today()): State {
  if (!state.settings.adaptive || daysBetween(state.lastReviewDate, date) < 7)
    return state;
  const from = addDays(date, -7);
  const attempts = state.attempts.filter(
    (a) => a.date >= from && a.date < date && a.score !== null,
  );
  const samples = Object.fromEntries(
    skills.map((k) => [k, attempts.filter((a) => a.skill === k).length]),
  ) as Record<(typeof skills)[number], number>;
  const means = Object.fromEntries(
    skills.map((k) => [
      k,
      samples[k] >= 3
        ? attempts
            .filter((a) => a.skill === k)
            .reduce((n, a) => n + (a.score ?? 0), 0) / samples[k]
        : null,
    ]),
  ) as Record<(typeof skills)[number], number | null>;
  const tasks = Array.from({ length: 7 }, (_, i) => addDays(from, i))
    .filter((d) => d >= state.profile.startDate)
    .flatMap((d) => tasksForDate(state, d));
  const completion = tasks.length
    ? tasks.filter((t) => t.status === "done").length / tasks.length
    : null;
  const before = { ...state.settings.effective },
    after = { ...before };
  let reason = "数据不足：每项至少需要 3 次有效评分，保持当前配额。";
  const weak = skills
    .filter((k) => means[k] !== null && means[k]! < 0.6)
    .sort((a, b) => means[a]! - means[b]!);
  const strong = skills
    .filter((k) => means[k] !== null && means[k]! >= 0.8)
    .sort((a, b) => means[b]! - means[a]!);
  if (
    skills.some((k) => samples[k] >= 3) &&
    completion !== null &&
    completion < 0.5
  )
    reason = `本周任务完成率 ${Math.round(completion * 100)}%，先保持配额，优先完成已有任务。`;
  else if (weak.length && strong.length) {
    const take = strong[0],
      give = weak[0],
      minutes = Math.min(5, after[take] - 5);
    after[take] -= minutes;
    after[give] += minutes;
    reason = minutes
      ? `根据最近 7 天有效练习，${labels[give]} 平均正确率 ${Math.round(means[give]! * 100)}%，从 ${labels[take]} 转移 ${minutes} 分钟。总时长不变。`
      : "熟练项目已达最低配额，维持计划。";
  } else if (skills.some((k) => samples[k] >= 3))
    reason = "已有评分暂未同时显示明确薄弱项与熟练项，保持均衡配额。";
  return {
    ...state,
    settings: { ...state.settings, effective: after },
    lastReviewDate: date,
    weekly: [
      ...state.weekly,
      { id: `weekly:${date}`, date, from, before, after, reason, samples },
    ],
  };
}
export function recordAttempt(state: State, input: Attempt): State {
  const attempt = attemptSchema.parse(input);
  if (state.attempts.some((a) => a.id === attempt.id)) return state;
  return collectAttemptMistakes(
    attachAttemptToSchedule(
      {
        ...state,
        attempts: [...state.attempts, attempt],
        tasks: state.tasks.map((t) =>
          t.date === attempt.date && t.skill === attempt.skill
            ? { ...t, status: "done" as const }
            : t,
        ),
      },
      attempt,
    ),
    attempt,
  );
}
export function grade(answers: number[], correct: number[]): number {
  if (
    !correct.length ||
    answers.length !== correct.length ||
    Array.from(answers).some((a) => !Number.isInteger(a) || a < 0)
  )
    throw new Error("请完成所有题目");
  return answers.filter((a, i) => a === correct[i]).length / correct.length;
}
export function reviewWord(
  previous: WordReview | undefined,
  rating: "again" | "hard" | "good" | "easy",
  date = today(),
): WordReview {
  const p = previous ?? {
    interval: 1,
    ease: 2.5,
    repetitions: 0,
    due: date,
    lastDate: date,
  };
  const quality = { again: 1, hard: 3, good: 4, easy: 5 }[rating];
  const ease = Math.min(
    4,
    Math.max(1.3, p.ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );
  const repetitions = quality < 3 ? 0 : p.repetitions + 1;
  const interval =
    quality < 3
      ? 1
      : repetitions === 1
        ? 1
        : repetitions === 2
          ? 6
          : Math.max(1, Math.round(p.interval * ease));
  return {
    interval,
    ease,
    repetitions,
    due: addDays(date, interval),
    lastDate: date,
  };
}
export function parseBackup(text: string): State {
  if (text.length > 20000000) throw new Error("备份超过 20 MB 限制");
  const input = JSON.parse(text);
  if (input?.version === 1 || input?.version === 2) {
    input.version = 3;
    input.extension ??= defaultExtension(input.profile?.startDate);
  }
  const state = stateSchema.parse(input);
  const unique = <T extends { id: string }>(rows: T[]) =>
    Array.from(new Map(rows.map((r) => [r.id, r])).values());
  return {
    ...state,
    attempts: unique(state.attempts),
    tasks: unique(state.tasks),
    weekly: unique(state.weekly),
    assessments: unique(state.assessments),
  };
}
export function phaseForDay(day: number): number {
  return day <= 90 ? 0 : day <= 180 ? 1 : day <= 270 ? 2 : 3;
}
export function ieltsOverall(bands: number[]): number {
  return Math.round((bands.reduce((a, b) => a + b, 0) / bands.length) * 2) / 2;
}
