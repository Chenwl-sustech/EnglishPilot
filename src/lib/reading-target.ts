import type { State } from "./model";
import { readingLessons } from "./reading";
import { shiftDate } from "./calendar";
import { curriculumMaterials } from "./curriculum";
import { lessonLevel } from "./learning-library";
const canonical = (type: string) =>
  type === "matching-heading"
    ? "matching-headings"
    : type === "vocabulary"
      ? "vocabulary-in-context"
      : type;
export function readingTarget(
  s: State,
  date: string,
  exam: "ielts" | "toefl",
  day: number,
) {
  const validIds = new Set(
    s.attempts
      .filter((a) => a.date >= shiftDate(date, -28) && a.date < date)
      .map((a) => a.id),
  );
  const disputed = new Set(
    s.extension.disputes
      .filter((d) => d.kind === "question")
      .map((d) => d.targetId),
  );
  const types = new Map<string, { n: number; wrong: number }>();
  for (const t of s.extension.timings) {
    if (
      !validIds.has(t.attemptId) ||
      disputed.has(t.questionId) ||
      !["shared", exam].includes(t.exam)
    )
      continue;
    const key = canonical(t.questionType),
      x = types.get(key) ?? { n: 0, wrong: 0 };
    x.n++;
    if (!t.correct) x.wrong++;
    types.set(key, x);
  }
  for (const result of s.extension.questionOutcomes) {
    if (
      result.skill !== "reading" ||
      result.date < shiftDate(date, -28) ||
      result.date >= date ||
      disputed.has(result.questionId)
    )
      continue;
    const paper = s.extension.practiceSessions.find(
      (p) => p.id === result.sessionId,
    );
    if (paper && paper.exam !== exam) continue;
    const key = canonical(result.questionType),
      x = types.get(key) ?? { n: 0, wrong: 0 };
    x.n++;
    x.wrong += +!result.correct;
    types.set(key, x);
  }
  const weak = [...types]
    .filter(([, x]) => x.n >= 3 && x.wrong / x.n >= 0.4)
    .sort((a, b) => b[1].wrong / b[1].n - a[1].wrong / a[1].n)[0]?.[0];
  const selected = s.extension.studyLevel;
  const level =
    selected === "all"
      ? day < 90
        ? "foundation"
        : day < 270
          ? "intermediate"
          : "advanced"
      : selected;
  const weakPool = readingLessons.filter(
    (l) =>
      (l.exam === exam || l.exam === "shared") &&
      (selected === "all" || lessonLevel(l.id, l.level) === level) &&
      !!weak &&
      l.questions.some((q) => canonical(q.questionType) === canonical(weak)),
  );
  if (weakPool.length) {
    const specific = weakPool.filter((l) => l.exam === exam),
      pool = specific.length ? specific : weakPool;
    return { id: pool[day % pool.length].id, weak };
  }
  if (selected !== "all" || day >= 10) {
    const lessons = curriculumMaterials.filter(
      (m) =>
        m.skill === "reading" &&
        m.level === level &&
        (m.exam === "shared" || m.exam === exam),
    );
    const last = new Map(s.attempts.map((a) => [a.contentId, a.createdAt]));
    const unseen = lessons.filter((m) => !last.has(m.id));
    if (unseen.length)
      return { id: unseen[day % unseen.length].id, weak: undefined };
    if (lessons.length)
      return {
        id: [...lessons].sort((a, b) =>
          (last.get(a.id) ?? "").localeCompare(last.get(b.id) ?? ""),
        )[0].id,
        weak: undefined,
      };
  }
  return {
    id: readingLessons.filter((l) => l.exam === "shared")[day % 10].id,
    weak: undefined,
  };
}
