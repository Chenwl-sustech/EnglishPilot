import type { State } from "./model";
import { evaluationSchema, type Evaluation } from "./adaptive-model";
import { addEvaluationMistakes } from "./mistakes";
export function saveEvaluation(s: State, input: Evaluation): State {
  const e = evaluationSchema.parse(input);
  if (!s.attempts.some((a) => a.id === e.attemptId))
    throw new Error("请先保存练习");
  if (s.extension.evaluations.some((row) => row.id === e.id)) return s;
  // AI task feedback stays separate from objective practice and calibrated exam scores.
  return addEvaluationMistakes(
    {
      ...s,
      extension: {
        ...s.extension,
        evaluations: [...s.extension.evaluations, e],
      },
    },
    e,
  );
}
