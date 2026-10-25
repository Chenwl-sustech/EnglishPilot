import Dexie, { type Table } from "dexie";
import { type State, stateSchema } from "./model";
import { defaultState, parseBackup, today } from "./engine";
import { ensureAdaptiveDay } from "./scheduler";
import { migrateExistingReviews } from "./fsrs";
import { applyWeeklyAllocation } from "./weekly-planner";
import { collectAttemptMistakes } from "./mistakes";
import {
  encodeBackup,
  validateRecordings,
  type BackupContents,
} from "./backup";
import { curriculumSources } from "./curriculum";
import { weeklyExamSource } from "./weekly-exam-bank";
import { openVocabularySources } from "./open-vocabulary";

export type Recording = { id: string; blob: Blob; date: string; title: string };
class PilotDB extends Dexie {
  state!: Table<{ id: string; value: State }, string>;
  recordings!: Table<Recording, string>;
  listeningAudio!: Table<Recording, string>;
  constructor() {
    super("EnglishPilot");
    this.version(1).stores({ state: "id", recordings: "id,date" });
    this.version(2)
      .stores({ state: "id", recordings: "id,date" })
      .upgrade(async (tx) => {
        await tx
          .table("state")
          .toCollection()
          .modify((row) => {
            if (row.value?.version === 1) row.value.version = 2;
          });
      });
    this.version(3)
      .stores({ state: "id", recordings: "id,date" })
      .upgrade(async (tx) => {
        await tx
          .table("state")
          .toCollection()
          .modify((row) => {
            row.value = parseBackup(JSON.stringify(row.value));
          });
      });
    this.version(4).stores({
      state: "id",
      recordings: "id,date",
      listeningAudio: "id,date",
    });
  }
}
export const db = new PilotDB();
let channel: BroadcastChannel | undefined;
function announce() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("pilot-updated"));
    channel ??=
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("englishpilot")
        : undefined;
    channel?.postMessage("changed");
  }
}
export async function loadState(date = today()): Promise<State> {
  return db.transaction("rw", [db.state, db.listeningAudio], async () => {
    const row = await db.state.get("main");
    let state = row
      ? parseBackup(JSON.stringify(row.value))
      : defaultState(date);
    const available = new Set(
      await db.listeningAudio.toCollection().primaryKeys(),
    );
    state.extension.listeningMaterials = state.extension.listeningMaterials.map(
      (m) => ({ ...m, audioAvailable: available.has(m.audioId) }),
    );
    for (const source of curriculumSources)
      if (!state.extension.sources.some((s) => s.id === source.id))
        state.extension.sources.push({
          id: source.id,
          name: source.title,
          url: "",
          license: source.license,
          licenseUrl: source.licenseUrl,
          attribution: source.attribution,
          modification: source.note,
        });
    if (
      !state.extension.sources.some(
        (source) => source.id === weeklyExamSource.id,
      )
    )
      state.extension.sources.push(weeklyExamSource);
    for (const source of openVocabularySources)
      if (!state.extension.sources.some((s) => s.id === source.id))
        state.extension.sources.push(source);
    // Older schedules reused a week ID on both weekend days. Preserve the
    // completed paper while giving a later pending task its own dated paper.
    state.extension.tasks = state.extension.tasks.map((task) => {
      if (
        task.type !== "mini-test" ||
        !["pending", "paused", "running"].includes(task.status)
      )
        return task;
      const completed = state.extension.practiceSessions.find(
        (p) =>
          p.id === task.exerciseId &&
          p.status === "completed" &&
          p.date !== task.scheduledDate,
      );
      if (!completed) return task;
      const exerciseId = `${task.exerciseId}:${task.scheduledDate}`;
      return {
        ...task,
        exerciseId,
        knowledgeKey: `mini-test:${exerciseId}`,
        reason: task.reason + " · 旧版周测已完成，本日生成独立试卷",
      };
    });
    if (state.profile.onboarded) {
      state = migrateExistingReviews(state);
      if (!state.extension.mistakes.length)
        for (const a of state.attempts.filter((a) => a.errors.length))
          state = collectAttemptMistakes(state, a);
      state = applyWeeklyAllocation(state, date);
      state = ensureAdaptiveDay(state, date);
    }
    await db.state.put({ id: "main", value: state });
    return state;
  });
}
export async function mutateState(
  change: (state: State) => State,
): Promise<State> {
  const value = await db.transaction("rw", db.state, async () => {
    const row = await db.state.get("main");
    const result = stateSchema.parse(change(row?.value ?? defaultState()));
    await db.state.put({ id: "main", value: result });
    return result;
  });
  announce();
  return value;
}
export async function restoreState(json: string): Promise<State> {
  return restoreBackup({
    format: "legacy-json",
    state: parseBackup(json),
    recordings: null,
  });
}
export async function exportFullBackup(): Promise<Blob> {
  const snapshot = await db.transaction(
    "r",
    [db.state, db.recordings, db.listeningAudio],
    async () => ({
      state: (await db.state.get("main"))?.value ?? defaultState(),
      recordings: await db.recordings.toArray(),
      listeningAudio: await db.listeningAudio.toArray(),
    }),
  );
  return encodeBackup(
    snapshot.state,
    snapshot.recordings,
    snapshot.listeningAudio,
  );
}
export async function mutateWithRecording(
  recording: Recording,
  change: (state: State) => State,
): Promise<State> {
  validateRecordings([recording]);
  const value = await db.transaction(
    "rw",
    [db.state, db.recordings],
    async () => {
      const row = await db.state.get("main");
      const result = stateSchema.parse(change(row?.value ?? defaultState()));
      await db.recordings.put(recording);
      await db.state.put({ id: "main", value: result });
      return result;
    },
  );
  announce();
  return value;
}
export async function restoreBackup(contents: BackupContents): Promise<State> {
  const value = parseBackup(JSON.stringify(contents.state));
  if (contents.format === "complete" && !contents.recordings)
    throw new Error("完整备份缺少录音清单");
  if (contents.recordings) validateRecordings(contents.recordings);
  if (contents.listeningAudio) validateRecordings(contents.listeningAudio);
  await db.transaction(
    "rw",
    [db.state, db.recordings, db.listeningAudio],
    async () => {
      await db.state.put({ id: "main", value });
      if (contents.format === "complete") {
        await db.recordings.clear();
        await db.recordings.bulkPut(contents.recordings!);
        if (contents.listeningAudio) {
          await db.listeningAudio.clear();
          await db.listeningAudio.bulkPut(contents.listeningAudio);
        }
      }
    },
  );
  announce();
  return value;
}
export async function mutateWithListeningAudio(
  audio: Recording,
  change: (s: State) => State,
): Promise<State> {
  return mutateWithListeningAudios([audio], change);
}
export async function mutateWithListeningAudios(
  audio: Recording[],
  change: (s: State) => State,
): Promise<State> {
  validateRecordings(audio);
  const value = await db.transaction(
    "rw",
    [db.state, db.listeningAudio],
    async () => {
      const row = await db.state.get("main");
      const next = stateSchema.parse(change(row?.value ?? defaultState()));
      await db.listeningAudio.bulkPut(audio);
      await db.state.put({ id: "main", value: next });
      return next;
    },
  );
  announce();
  return value;
}
