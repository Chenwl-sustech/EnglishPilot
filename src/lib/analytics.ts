import { z } from "zod";
import type { State } from "./model";
import { fourSkills, type FourSkill } from "./adaptive-model";
import { budgetForState } from "./scheduler";
import { chinaDate, shiftDate, calendarDays } from "./calendar";
import { rankDueReviews } from "./fsrs";
export function dateCompliance(s: State, date: string) {
  const budget =
    s.extension.budgets.find((b) => b.date === date) ?? budgetForState(s, date);
  const tasks = s.extension.tasks.filter(
    (t) =>
      t.scheduledDate === date &&
      !t.optional &&
      !["cancelled", "deferred"].includes(t.status),
  );
  return (
    budget.rest || (tasks.length > 0 && tasks.every((t) => t.status === "done"))
  );
}
export function analyticsSummary(s: State, date = chinaDate()) {
  const today = s.attempts.filter((a) => a.date === date),
    week = s.attempts.filter(
      (a) =>
        a.date >=
          shiftDate(
            date,
            -((new Date(`${date}T12:00Z`).getUTCDay() + 6) % 7),
          ) && a.date <= date,
    );
  const actualDates = new Set(s.attempts.map((a) => a.date));
  let actualStreak = 0,
    complianceStreak = 0;
  for (
    let d = actualDates.has(date) ? date : shiftDate(date, -1);
    d >= s.profile.startDate && actualDates.has(d);
    d = shiftDate(d, -1)
  )
    actualStreak++;
  for (
    let d = dateCompliance(s, date) ? date : shiftDate(date, -1);
    d >= s.profile.startDate && dateCompliance(s, d);
    d = shiftDate(d, -1)
  )
    complianceStreak++;
  const tasks = s.extension.tasks.filter(
    (t) =>
      t.scheduledDate === date &&
      !t.optional &&
      !["deferred", "cancelled"].includes(t.status),
  );
  const rest = (
    s.extension.budgets.find((b) => b.date === date) ?? budgetForState(s, date)
  ).rest;
  const nextTest =
    Array.from({ length: 28 }, (_, i) => shiftDate(date, i)).find((d) => {
      const b = budgetForState(s, d);
      return (
        !b.rest &&
        (b.intensive ||
          (s.extension.calendarRules.weekendTest &&
            b.limit >= 60 &&
            [0, 6].includes(new Date(`${d}T12:00Z`).getUTCDay())))
      );
    }) ?? null;
  return {
    day: Math.max(1, calendarDays(s.profile.startDate, date) + 1),
    examDays: calendarDays(date, s.profile.examDate),
    todaySeconds: today.reduce((n, a) => n + a.seconds, 0),
    weekSeconds: week.reduce((n, a) => n + a.seconds, 0),
    totalSeconds: s.attempts.reduce((n, a) => n + a.seconds, 0),
    todayCompletion: rest
      ? 1
      : tasks.length
        ? tasks.filter((t) => t.status === "done").length / tasks.length
        : 0,
    actualStreak,
    complianceStreak,
    mastered: Object.values(s.extension.fsrsReviews).filter(
      (r) => r.card.state === 2 && r.card.stability >= 21 && r.card.reps >= 3,
    ).length,
    due: rankDueReviews(
      s.extension.fsrsReviews,
      new Date(`${date}T23:59:59+08:00`),
    ).length,
    mistakes: s.extension.mistakes.length,
    resolved: s.extension.mistakes.filter((m) => m.status === "resolved")
      .length,
    nextTest,
  };
}
const assessmentSchema = z.object({
  exam: z.enum(["ielts", "toefl"]),
  date: z.iso.date(),
  kind: z.enum(["official", "calibrated-mock"]),
  source: z.string().trim().min(1).max(500),
  scores: z.object({
    listening: z.number(),
    reading: z.number(),
    writing: z.number(),
    speaking: z.number(),
  }),
});
export function saveTrustedAssessment(
  s: State,
  raw: z.infer<typeof assessmentSchema>,
): State {
  const i = assessmentSchema.parse(raw),
    max = i.exam === "ielts" ? 9 : 6,
    min = i.exam === "ielts" ? 0 : 1;
  if (i.date > chinaDate()) throw new Error("测试日期不能在未来");
  if (Object.values(i.scores).some((n) => n < min || n > max || (n * 2) % 1))
    throw new Error("分数应符合所选考试量表与 0.5 分间隔");
  const assessmentId = crypto.randomUUID();
  return {
    ...s,
    extension: {
      ...s.extension,
      scoreHistory: [
        ...s.extension.scoreHistory,
        ...fourSkills.map((skill) => ({
          id: `${assessmentId}:${skill}`,
          assessmentId,
          date: i.date,
          exam: i.exam,
          kind: i.kind,
          skill,
          score: i.scores[skill],
          max,
          sampleCount: 1,
          source: i.source,
          complete: true,
        })),
        {
          id: `${assessmentId}:overall`,
          assessmentId,
          date: i.date,
          exam: i.exam,
          kind: i.kind,
          skill: "overall",
          score:
            Math.round(
              (Object.values(i.scores).reduce((n, v) => n + v, 0) / 4) * 2,
            ) / 2,
          max,
          sampleCount: 1,
          source: i.source,
          complete: true,
        },
      ],
    },
  };
}
export function trustedGap(s: State, exam: "ielts" | "toefl") {
  const rows = s.extension.scoreHistory
    .filter(
      (r) =>
        r.exam === exam &&
        r.kind !== "ai-estimate" &&
        r.complete &&
        r.max === (exam === "ielts" ? 9 : 6) &&
        r.skill !== "overall",
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const row of rows) {
    const group = rows.filter((r) =>
      r.assessmentId
        ? row.assessmentId === r.assessmentId
        : r.date === row.date && r.source === row.source && r.kind === row.kind,
    );
    if (!fourSkills.every((k) => group.some((r) => r.skill === k))) continue;
    const skills = Object.fromEntries(
      fourSkills.map((k) => {
        const score = group.find((r) => r.skill === k)!.score;
        const target =
          exam === "ielts"
            ? (s.profile[
                `ielts${k[0].toUpperCase() + k.slice(1)}` as keyof State["profile"]
              ] as number)
            : s.profile.toefl2026;
        return [k, { score, target, gap: Math.max(0, target - score) }];
      }),
    ) as Record<FourSkill, { score: number; target: number; gap: number }>;
    const overall =
      Math.round(
        (fourSkills.reduce((n, k) => n + skills[k].score, 0) / 4) * 2,
      ) / 2;
    const target = exam === "ielts" ? s.profile.ielts : s.profile.toefl2026;
    return {
      date: row.date,
      source: row.source,
      kind: row.kind,
      skills,
      overall,
      overallGap: Math.max(0, target - overall),
      target,
    };
  }
  return null;
}
