import { grammar, listenings, type Lesson } from "./content";
import { curriculumMaterials, type CurriculumLevel } from "./curriculum";
import type { State } from "./model";
export const levelNames: Record<CurriculumLevel, string> = {
  foundation: "基础巩固",
  intermediate: "进阶应用",
  advanced: "学术拓展",
};
export const gradedLessons: Lesson[] = curriculumMaterials.map((m) => ({
  id: m.id,
  title: m.title,
  level: levelNames[m.level],
  category: `原创分级 · ${m.exam.toUpperCase()}`,
  text: m.text,
  questions: m.questions,
}));
export const grammarLibrary = [
  ...grammar,
  ...gradedLessons.filter(
    (l) =>
      curriculumMaterials.find((m) => m.id === l.id)?.skill === "foundation",
  ),
];
export const listeningLibrary = [
  ...listenings,
  ...gradedLessons.filter(
    (l) =>
      curriculumMaterials.find((m) => m.id === l.id)?.skill === "listening",
  ),
];
export function lessonLevel(id: string, reference = ""): CurriculumLevel {
  return (
    curriculumMaterials.find((m) => m.id === id)?.level ??
    (/A[12]/.test(reference)
      ? "foundation"
      : /B1/.test(reference)
        ? "intermediate"
        : "advanced")
  );
}
export function selectLearningLesson(
  s: State,
  kind: "grammar" | "listening",
  day: number,
) {
  const all = kind === "grammar" ? grammarLibrary : listeningLibrary;
  const exam = s.profile.mode === "dual" ? s.profile.primary : s.profile.mode;
  const level = s.extension.studyLevel;
  const pool = all.filter(
    (l) =>
      (level === "all" || lessonLevel(l.id, l.level) === level) &&
      !curriculumMaterials.some(
        (m) => m.id === l.id && m.exam !== "shared" && m.exam !== exam,
      ),
  );
  const graded = pool.filter((l) =>
    curriculumMaterials.some((m) => m.id === l.id),
  );
  const available =
    level !== "all" && graded.length ? graded : pool.length ? pool : all;
  const history = new Map<string, string>();
  for (const a of s.attempts) history.set(a.contentId, a.createdAt);
  const unseen = available.filter((l) => !history.has(l.id));
  if (unseen.length) return unseen[day % unseen.length];
  return [...available].sort((a, b) =>
    (history.get(a.id) ?? "").localeCompare(history.get(b.id) ?? ""),
  )[0];
}
