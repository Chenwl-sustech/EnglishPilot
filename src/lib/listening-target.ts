import type { State } from "./model";
import type { DynamicTask } from "./adaptive-model";
import { calendarDays, shiftDate } from "./calendar";
import { selectLearningLesson } from "./learning-library";
import { normalizeDictation } from "./listening";

type Training = "listening" | "dictation" | "shadowing";
const normalize = (text: string) => normalizeDictation(text).join(" ");
export function selectImportedListeningTarget(
  s: State,
  date: string,
  exam: "ielts" | "toefl",
  type: Training,
  minutes: number,
  exclude: ReadonlySet<string> = new Set(),
) {
  const pool = s.extension.listeningMaterials.filter(
    (m) =>
      m.audioAvailable &&
      (m.exam === exam || m.exam === "general") &&
      !exclude.has(m.id) &&
      (type === "listening"
        ? m.questions.length > 0 && m.duration <= minutes * 60
        : m.segments.some(
            (segment) => segment.end - segment.start <= minutes * 60,
          )),
  );
  const recent = s.attempts.filter(
    (a) => a.date <= date && a.date >= shiftDate(date, -28),
  );
  const stats = new Map<string, { total: number; wrong: number }>();
  for (const a of recent) {
    if (a.skill !== "listening" || a.score === null) continue;
    const material = s.extension.listeningMaterials.find(
      (m) => m.id === a.contentId && (m.exam === exam || m.exam === "general"),
    );
    if (!material) continue;
    try {
      const answer = JSON.parse(a.answer);
      if (
        answer.revision !== undefined &&
        answer.revision !== material.revision
      )
        continue;
      for (const q of material.questions) {
        if (typeof answer.responses?.[q.id] !== "string") continue;
        const stat = stats.get(q.questionType) ?? { total: 0, wrong: 0 };
        stat.total++;
        if (
          !q.answers.some(
            (expected) =>
              normalize(expected) === normalize(answer.responses[q.id]),
          )
        )
          stat.wrong++;
        stats.set(q.questionType, stat);
      }
    } catch {
      /* Older attempts without structured answers remain valid history, not question-level evidence. */
    }
  }
  const ranked = pool
    .map((material) => {
      const attempts = recent.filter((a) => a.contentId === material.id),
        last =
          attempts
            .map((a) => a.date)
            .sort()
            .at(-1) ?? "";
      const weak = material.questions
        .map((q) => ({ type: q.questionType, stat: stats.get(q.questionType) }))
        .filter(
          ({ stat }) =>
            stat &&
            stat.total >= 3 &&
            stat.wrong >= 2 &&
            (stat.wrong + 1) / (stat.total + 2) >= 0.5,
        )
        .map(({ type, stat }) => ({
          type,
          risk: (stat!.wrong + 1) / (stat!.total + 2),
        }))
        .sort((a, b) => b.risk - a.risk)[0];
      return {
        material,
        last,
        count: attempts.length,
        cooldown: last >= shiftDate(date, -2) ? 1 : 0,
        weak,
        reason: `${material.origin === "official-sample" ? "官方样题" : "个人素材"} · ${material.title}${weak && weak.risk >= 0.5 ? ` · 近期 ${weak.type} 反复出错，优先复练` : " · 优先未练或较久未练素材"}`,
      };
    })
    .sort(
      (a, b) =>
        (a.material.exam === exam ? 0 : 1) -
          (b.material.exam === exam ? 0 : 1) ||
        a.cooldown - b.cooldown ||
        (b.weak?.risk ?? 0) - (a.weak?.risk ?? 0) ||
        a.count - b.count ||
        a.last.localeCompare(b.last) ||
        a.material.id.localeCompare(b.material.id),
    );
  return ranked[0] ?? null;
}
/** Rebind only untouched daily slots; task IDs, budget, completed work and recordings stay stable. */
export function bindImportedListeningTasks(s: State, date: string): State {
  const used = new Set<string>();
  const tasks = s.extension.tasks.map((t) => {
    if (
      t.scheduledDate !== date ||
      !["listening", "dictation", "shadowing"].includes(t.type)
    )
      return t;
    const type = t.type as Training;
    if (
      t.status !== "pending" ||
      t.actualSeconds ||
      t.completionIds.length ||
      s.extension.selectedTaskId === t.id
    ) {
      used.add(t.exerciseId);
      return t;
    }
    const current = s.extension.listeningMaterials.find(
      (m) => m.id === t.exerciseId,
    );
    const valid =
      current?.audioAvailable &&
      (type === "listening"
        ? current.questions.length > 0 &&
          current.duration <= t.estimatedMinutes * 60
        : current.segments.some(
            (segment) => segment.end - segment.start <= t.estimatedMinutes * 60,
          ));
    if (valid) {
      used.add(t.exerciseId);
      return t;
    }
    const target = selectImportedListeningTarget(
      s,
      date,
      t.exam === "shared" ? "ielts" : t.exam,
      type,
      t.estimatedMinutes,
      used,
    );
    if (!target && !current) return t;
    const exerciseId =
      target?.material.id ??
      selectLearningLesson(
        s,
        "listening",
        Math.max(0, calendarDays(s.profile.startDate, date)),
      ).id;
    used.add(exerciseId);
    return {
      ...t,
      exerciseId,
      knowledgeKey: `${t.type}:${exerciseId}`,
      reason: target?.reason ?? "原音或已确认时间轴不可用，使用原有课程",
    } as DynamicTask;
  });
  return { ...s, extension: { ...s.extension, tasks } };
}
