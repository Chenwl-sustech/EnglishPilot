import type { State } from "./model";
import {
  practiceItemSchema,
  type PracticeItem,
  type PracticeSession,
} from "./practice-model";

function hash(text: string) {
  let n = 2166136261;
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
/** Freeze local official sample questions; media stays in the existing private audio table. */
export function selectWeeklyOfficial(
  s: State,
  exam: PracticeSession["exam"],
  level: PracticeSession["level"],
  seed: string,
  minutes: number,
  count = 3,
): PracticeItem[] {
  const recent = s.extension.practiceSessions
    .filter((p) => p.kind === "weekly" && p.exam === exam)
    .slice(-4);
  const questions = new Set(
    recent.flatMap((p) =>
      p.sections.flatMap((sec) => sec.items.map((i) => i.id)),
    ),
  );
  const audio = new Set(
    recent.flatMap((p) =>
      p.sections.flatMap((sec) =>
        sec.items.flatMap((i) => (i.audio ? [i.audio.audioId] : [])),
      ),
    ),
  );
  let remainingSeconds = Math.max(0, minutes * 60 - 90);
  const selected: PracticeItem[] = [];
  const materials = s.extension.listeningMaterials
    .filter(
      (m) =>
        m.origin === "official-sample" &&
        m.exam === exam &&
        m.audioAvailable &&
        m.questions.length,
    )
    .sort(
      (a, b) =>
        +audio.has(a.audioId) - +audio.has(b.audioId) ||
        hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`),
    );
  for (const m of materials) {
    if (selected.length === count) break;
    if (m.duration > remainingSeconds) continue;
    const items = m.questions
      .map((q) =>
        practiceItemSchema.parse({
          id: `official:${m.id}:r${m.revision}:${q.id}`,
          materialId: m.id,
          exam,
          level,
          skill: "listening",
          kind: q.kind === "choice" ? "choice" : "sentence",
          questionType: q.questionType,
          context: m.transcript,
          prompt: q.prompt,
          options: q.options,
          correct: q.kind === "choice" ? q.options.indexOf(q.answers[0]) : null,
          expected: q.kind === "text" ? q.answers[0] : "",
          acceptedAnswers: q.answers,
          answerKeys: q.answerKeys,
          distinctGroup: q.distinctGroup ? `${m.id}:${q.distinctGroup}` : "",
          explanation: q.explanation,
          sourceId: m.id,
          audio: {
            audioId: m.audioId,
            materialId: m.id,
            revision: m.revision,
            title: m.title,
            publisher: m.publisher,
            sourceUrl: m.sourceUrl,
            license: m.license,
            licenseUrl: m.licenseUrl,
            duration: m.duration,
            origin: m.origin,
          },
        }),
      )
      .sort(
        (a, b) =>
          +questions.has(a.id) - +questions.has(b.id) ||
          hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`),
      );
    selected.push(...items.slice(0, count - selected.length));
    remainingSeconds -= m.duration;
  }
  return selected;
}
