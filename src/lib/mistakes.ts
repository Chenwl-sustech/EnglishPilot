import type { Attempt, State } from "./model";
import type { Evaluation, UnifiedMistake } from "./adaptive-model";
import { mistakeSchema } from "./adaptive-model";
import { createFsrsReview, reviewFsrs, type ReviewRating } from "./fsrs";
import { chinaDate } from "./calendar";
function fingerprint(text: string) {
  let hash = 2166136261;
  for (const c of text.normalize("NFKC").toLowerCase().replace(/\s+/g, " "))
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `mistake:${(hash >>> 0).toString(36)}`;
}
export function addMistake(
  s: State,
  input: Omit<
    UnifiedMistake,
    "id" | "count" | "lastDate" | "nextReview" | "fsrs"
  > & { date?: string },
): State {
  const key = fingerprint(
      `${input.skill}|${input.category}|${input.original}|${input.correction}`,
    ),
    id = s.extension.mistakeAliases[key] ?? key,
    old = s.extension.mistakes.find((m) => m.id === id);
  const date = input.date ?? chinaDate();
  const fresh = mistakeSchema.parse({
    ...input,
    id,
    count: 1,
    lastDate: date,
    nextReview: null,
  });
  const row = old
    ? {
        ...old,
        count:
          old.count +
          (input.attemptIds.some((a) => !old.attemptIds.includes(a)) ? 1 : 0),
        response: input.response,
        attemptIds: [...new Set([...old.attemptIds, ...input.attemptIds])],
        lastDate: date,
        status: old.status === "resolved" ? ("open" as const) : old.status,
      }
    : fresh;
  return {
    ...s,
    extension: {
      ...s.extension,
      mistakes: [...s.extension.mistakes.filter((m) => m.id !== id), row],
    },
  };
}
export function collectAttemptMistakes(state: State, attempt: Attempt): State {
  let s = state;
  for (const text of attempt.errors) {
    const lines = text.split("\n"),
      original =
        lines.find((l) => l.startsWith("原句："))?.slice(3) ?? lines[0];
    const response =
      lines.find((l) => l.startsWith("你的答案："))?.slice(5) ?? attempt.answer;
    const correction =
      lines.find((l) => l.startsWith("正确答案："))?.slice(5) ??
      (text.includes("正确答案：") ? text.split("正确答案：")[1] : "查看解析");
    const explanation =
      lines.find((l) => l.startsWith("解析："))?.slice(3) ?? text;
    const category: UnifiedMistake["category"] = text.includes("Missing Words")
      ? "Missing Words"
      : text.includes("Extra Words")
        ? "Extra Words"
        : text.includes("Incorrect Words")
          ? "Incorrect Words"
          : attempt.skill === "foundation"
            ? text.includes("拼写")
              ? "Spelling"
              : "Grammar"
            : "Comprehension";
    s = addMistake(s, {
      source: attempt.contentId,
      skill: attempt.skill,
      questionType: attempt.skill === "foundation" ? "基础知识" : "客观理解",
      category,
      original,
      response,
      correction,
      explanation,
      status: "open",
      attemptIds: [attempt.id],
      date: attempt.date,
    });
  }
  return s;
}
export function addEvaluationMistakes(
  state: State,
  evaluation: Evaluation,
): State {
  let s = state;
  for (const error of evaluation.errors)
    s = addMistake(s, {
      source: evaluation.id,
      skill: evaluation.skill,
      questionType: evaluation.taskType,
      category: error.category,
      original: error.original,
      response: error.original,
      correction: error.suggestion,
      explanation: `${error.explanation}\n示例：${error.example}\nAI 反馈待用户确认`,
      status: "pending-confirmation",
      attemptIds: [evaluation.attemptId],
    });
  return s;
}
export function confirmMistake(s: State, id: string): State {
  return {
    ...s,
    extension: {
      ...s.extension,
      mistakes: s.extension.mistakes.map((m) =>
        m.id === id
          ? {
              ...m,
              status: "open",
              fsrs: m.fsrs ?? createFsrsReview(),
              nextReview: new Date().toISOString(),
            }
          : m,
      ),
    },
  };
}
export function reviewMistake(
  s: State,
  id: string,
  rating: ReviewRating,
  now = new Date(),
): State {
  const mistake = s.extension.mistakes.find((m) => m.id === id);
  if (!mistake) throw new Error("错题不存在");
  if (
    mistake.status === "pending-confirmation" ||
    mistake.status === "disputed"
  )
    throw new Error("先确认该知识点，再进行复习");
  const fsrs = reviewFsrs(mistake.fsrs, rating, now);
  return {
    ...s,
    extension: {
      ...s.extension,
      mistakes: s.extension.mistakes.map((m) =>
        m.id === id
          ? {
              ...m,
              fsrs,
              nextReview: fsrs.card.due,
              status:
                rating === "easy" && fsrs.card.reps >= 3
                  ? "resolved"
                  : "reviewing",
            }
          : m,
      ),
    },
  };
}
export function mergeMistakes(s: State, ids: string[]): State {
  const chosen = s.extension.mistakes.filter((m) => ids.includes(m.id));
  if (chosen.length < 2) throw new Error("请至少选择两条错题");
  if (new Set(chosen.map((m) => m.category)).size > 1)
    throw new Error("只允许合并相同错误分类的记录");
  const first = chosen[0],
    merged = {
      ...first,
      count: chosen.reduce((n, m) => n + m.count, 0),
      original: chosen.map((m) => m.original).join("\n"),
      explanation: chosen
        .map((m) => `${m.original}：${m.explanation}`)
        .join("\n"),
      lastDate: chosen
        .map((m) => m.lastDate)
        .sort()
        .at(-1)!,
      attemptIds: [...new Set(chosen.flatMap((m) => m.attemptIds))],
      status: chosen.some((m) => m.status === "disputed")
        ? ("disputed" as const)
        : chosen.some((m) => m.status === "pending-confirmation")
          ? ("pending-confirmation" as const)
          : first.status,
    };
  const aliases = { ...s.extension.mistakeAliases };
  for (const [key, value] of Object.entries(aliases))
    if (ids.includes(value)) aliases[key] = first.id;
  for (const id of ids) aliases[id] = first.id;
  return {
    ...s,
    extension: {
      ...s.extension,
      mistakeAliases: aliases,
      mistakeMerges: [
        ...s.extension.mistakeMerges,
        {
          id: crypto.randomUUID(),
          mergedInto: first.id,
          createdAt: new Date().toISOString(),
          records: chosen,
        },
      ],
      mistakes: [
        ...s.extension.mistakes.filter((m) => !ids.includes(m.id)),
        merged,
      ],
    },
  };
}
