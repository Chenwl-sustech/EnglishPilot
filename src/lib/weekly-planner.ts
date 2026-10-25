import type { State, Attempt } from "./model";
import { fourSkills, type FourSkill } from "./adaptive-model";
import { chinaDate, calendarDays, shiftDate } from "./calendar";
import { budgetForState } from "./scheduler";
const names: Record<FourSkill, string> = {
  listening: "听力",
  reading: "阅读",
  writing: "写作",
  speaking: "口语",
};
function mean(values: { value: number; weight: number }[]) {
  const weight = values.reduce((n, v) => n + v.weight, 0);
  return weight
    ? values.reduce((n, v) => n + v.value * v.weight, 0) / weight
    : null;
}
export function planWeeklyAllocation(s: State, date = chinaDate()) {
  const e = s.extension,
    c = e.plannerConfig,
    from = shiftDate(date, -c.windowDays),
    before = { ...e.ratios },
    after = { ...before };
  const exam = s.profile.mode === "dual" ? s.profile.primary : s.profile.mode;
  const matchesImportedExam = (a: Attempt) =>
    !a.contentId.startsWith("listening:") || a.contentId.endsWith(`:${exam}`);
  const samples: Record<string, number> = {},
    performance: Partial<Record<FourSkill, number>> = {};
  for (const skill of fourSkills) {
    const points: { value: number; weight: number }[] = [];
    if (skill === "reading" || skill === "listening") {
      const dictationIds = new Set(e.dictations.map((d) => d.attemptId));
      const attempts = s.attempts.filter(
        (a) =>
          a.skill === skill &&
          a.date >= from &&
          a.date < date &&
          a.score !== null &&
          matchesImportedExam(a) &&
          !dictationIds.has(a.id),
      );
      for (const a of attempts) {
        const practice = e.practiceSessions.find((p) =>
          a.id.startsWith(`${p.id}:`),
        );
        if (practice && practice.exam !== exam) continue;
        const timing = e.timings.find((t) => t.attemptId === a.id);
        if (timing && timing.exam !== "shared" && timing.exam !== exam)
          continue;
        const difficulty =
          e.timings.find((t) => t.attemptId === a.id)?.difficulty ?? "B1";
        const factor =
          (
            { A1: 1, A2: 0.95, B1: 0.9, B2: 0.8, C1: 0.7 } as Record<
              string,
              number
            >
          )[difficulty] ?? 0.9;
        points.push({
          value: 1 - (1 - a.score!) * factor,
          weight: Math.exp(-calendarDays(a.date, date) / 14),
        });
      }
    } else {
      const seen = new Set<string>();
      for (const result of [...e.evaluations].reverse()) {
        const d = chinaDate(new Date(result.createdAt));
        if (
          result.skill !== skill ||
          result.exam !== exam ||
          d < from ||
          d >= date ||
          result.normalized === null ||
          result.disputed ||
          seen.has(result.attemptId)
        )
          continue;
        seen.add(result.attemptId);
        points.push({
          value: result.normalized,
          weight: 0.35 * Math.exp(-calendarDays(d, date) / 14),
        });
      }
    }
    for (const result of e.scoreHistory.filter(
      (r) =>
        r.skill === skill &&
        r.exam === exam &&
        r.kind !== "ai-estimate" &&
        r.complete &&
        r.date >= from &&
        r.date < date &&
        r.max === (r.exam === "ielts" ? 9 : 6),
    ))
      points.push({
        value: result.score / result.max,
        weight: 2 * Math.exp(-calendarDays(result.date, date) / 14),
      });
    samples[skill] = points.length;
    if (points.length >= c.sampleMinimum) {
      const weight = points.reduce((n, p) => n + p.weight, 0);
      performance[skill] = (mean(points)! * weight + 0.65 * 2) / (weight + 2);
    }
  }
  const tasks = e.tasks.filter(
    (t) =>
      t.scheduledDate >= shiftDate(date, -7) &&
      t.scheduledDate < date &&
      !t.optional &&
      !["deferred", "cancelled"].includes(t.status),
  );
  const plannedDays = Array.from({ length: 7 }, (_, i) =>
    shiftDate(date, -7 + i),
  ).filter(
    (d) =>
      d >= s.profile.startDate &&
      !(e.budgets.find((b) => b.date === d) ?? budgetForState(s, d)).rest,
  );
  const expected = plannedDays.length * 4;
  const completion = tasks.length
    ? tasks.filter((t) => t.status === "done").length /
      Math.max(tasks.length, expected)
    : null;
  const objective = s.attempts.filter(
    (a) =>
      a.score !== null &&
      a.date >= from &&
      a.date < date &&
      matchesImportedExam(a),
  );
  const recent = objective.filter((a) => a.date >= shiftDate(date, -7)),
    prior = objective.filter((a) => a.date < shiftDate(date, -7));
  const average = (arr: Attempt[]) =>
    arr.reduce((n, a) => n + (a.score ?? 0), 0) / arr.length;
  const fatigue =
    (tasks.length >= 10 && completion !== null && completion < 0.5) ||
    (recent.length >= 5 &&
      prior.length >= 5 &&
      average(prior) - average(recent) > 0.18);
  const eligible = fourSkills.filter((k) => performance[k] !== undefined);
  const deficits = Object.fromEntries(
    eligible.map((k) => [k, 1 - performance[k]!]),
  ) as Partial<Record<FourSkill, number>>;
  // Calibrated/official evidence affects only a matching exam and its own scale.
  for (const k of eligible) {
    const trusted = [...e.scoreHistory]
      .reverse()
      .find(
        (r) =>
          r.skill === k &&
          r.exam === exam &&
          r.kind !== "ai-estimate" &&
          r.date >= from &&
          r.date < date,
      );
    if (trusted) {
      const target =
        trusted.exam === "ielts"
          ? (s.profile[
              `ielts${k[0].toUpperCase() + k.slice(1)}` as keyof State["profile"]
            ] as number)
          : s.profile.toefl2026;
      if (
        typeof target === "number" &&
        trusted.max === (trusted.exam === "ielts" ? 9 : 6)
      )
        deficits[k] =
          deficits[k]! * 0.7 +
          Math.max(0, (target - trusted.score) / trusted.max) * 0.3;
    }
  }
  let reason = "数据不足：各项至少需要多次有效练习，样本不足的项目保持原比例。";
  if (fatigue)
    reason =
      "近期完成率或表现明显下降，建议降低学习强度、优先复习；本周保持四项比例，不增加总时长。";
  else if (eligible.length >= 2) {
    const ordered = [...eligible].sort((a, b) => deficits[a]! - deficits[b]!);
    const strong = ordered[0],
      weak = ordered.at(-1)!;
    if (deficits[weak]! - deficits[strong]! >= 0.12) {
      const delta = Math.min(
        c.weeklyChange,
        c.max - before[weak],
        before[strong] - c.min,
      );
      if (delta > 0) {
        after[weak] += delta;
        after[strong] -= delta;
        const timings = e.timings.filter(
          (t) =>
            !t.correct &&
            t.exam ===
              (s.profile.mode === "dual"
                ? s.profile.primary
                : s.profile.mode) &&
            t.attemptId &&
            s.attempts.some(
              (a) => a.id === t.attemptId && a.date >= from && a.date < date,
            ),
        );
        const groups = new Map<string, number>();
        for (const t of timings)
          groups.set(t.questionType, (groups.get(t.questionType) ?? 0) + 1);
        const subtype = [...groups].sort((a, b) => b[1] - a[1])[0];
        reason = `过去 ${c.windowDays} 天${names[weak]}相对较弱（${samples[weak]} 次有效样本${weak === "reading" && subtype ? `，${subtype[0]} 错误较多` : ""}），从${names[strong]}转移 ${delta} 个百分点。基础与 FSRS 先预留，四项合计 100%。`;
      }
    } else reason = "平滑后的练习表现接近，保持当前四项比例。";
  }
  return {
    id: `allocation:${date}`,
    date,
    from,
    before,
    after,
    samples,
    reason,
    fatigue,
  };
}
export function applyWeeklyAllocation(s: State, date = chinaDate()): State {
  if (
    !s.settings.adaptive ||
    calendarDays(s.extension.lastAllocationDate, date) < 7
  )
    return s;
  const plan = planWeeklyAllocation(s, date);
  const changed = fourSkills.some((k) => plan.after[k] !== plan.before[k]);
  return {
    ...s,
    extension: {
      ...s.extension,
      ratios: plan.after,
      allocationMode: changed ? "adaptive" : s.extension.allocationMode,
      lastAllocationDate: date,
      allocations: [...s.extension.allocations, plan],
      lastScheduleDate: changed ? null : s.extension.lastScheduleDate,
    },
  };
}
