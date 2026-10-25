import { expect, it } from "vitest";
import { defaultState } from "../src/lib/engine";
import { createFsrsReview } from "../src/lib/fsrs";
import { ensureAdaptiveDay, generateDailyTasks } from "../src/lib/scheduler";
import { vocabularyEntries } from "../src/lib/vocabulary";

it("assigns grammar rather than a blank reference word after all annotated advanced words were studied", () => {
  const state = defaultState("2026-10-24");
  state.extension.studyLevel = "advanced";
  for (const word of vocabularyEntries(state).filter((w) => w.level === "advanced" && (w.meaning.trim() || w.definition.trim()))) {
    const record = createFsrsReview(new Date("2099-01-01T00:00:00Z"));
    record.card.reps = 1; record.card.state = 2;
    state.extension.fsrsReviews[word.id] = record;
  }
  const tasks = generateDailyTasks(state, "2026-10-24");
  expect(tasks.some((t) => t.type === "new-vocabulary")).toBe(false);
  expect(tasks.some((t) => t.type === "grammar")).toBe(true);
});

it("repairs a previously assigned unannotated word on same-day reload while retaining time history", () => {
  const state = defaultState("2026-10-24");
  state.profile.onboarded = true;
  const base = generateDailyTasks(state, "2026-10-24").find((t) => t.type === "new-vocabulary")!;
  const broken = { ...base, id: "old-reference-task", exerciseId: "open:descendent", knowledgeKey: "new-vocabulary:open:descendent", actualSeconds: 17 };
  state.extension.tasks = [broken];
  state.extension.selectedTaskId = broken.id;
  state.extension.lastScheduleDate = "2026-10-24";
  const repaired = ensureAdaptiveDay(state, "2026-10-24");
  expect(repaired.extension.tasks.find((t) => t.id === broken.id)).toMatchObject({ status: "cancelled", actualSeconds: 17 });
  expect(repaired.extension.selectedTaskId).not.toBe(broken.id);
  expect(repaired.extension.tasks.filter((t) => ["pending", "paused", "running"].includes(t.status)).some((t) => t.exerciseId === "open:descendent")).toBe(false);
});
