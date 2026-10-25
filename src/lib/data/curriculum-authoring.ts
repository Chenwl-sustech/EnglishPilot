import type { CurriculumMaterial, CurriculumQuestionType } from "../curriculum";
export type QuestionRow = [CurriculumQuestionType, string, string[], number, string, string];
/** Only packages authored content; answers and evidence are supplied explicitly. */
export function material(
  id: string, title: string, level: CurriculumMaterial["level"], skill: CurriculumMaterial["skill"],
  text: string, rows: QuestionRow[],
): CurriculumMaterial {
  return {
    id, title, level, skill, exam: "shared", text, sourceId: "englishpilot-original-v2",
    questions: rows.map(([questionType, prompt, options, correct, explanation, evidence], index) => ({
      id: `${id}:q${index + 1}`, questionType, prompt, options, correct, explanation, evidence,
      difficulty: level === "foundation" ? 1 : level === "intermediate" ? 2 : 3,
    })),
  };
}
