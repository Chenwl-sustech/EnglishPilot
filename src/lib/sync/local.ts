import { PilotDB, loadState } from "../db";
import { defaultState, today } from "../engine";
import { stateSchema } from "../model";
import { validateRecordings } from "../backup";
import { makeDocument, type Snapshot, type SyncDocument } from "./document";
import { equal } from "./merge";

export type SyncMeta = {
  id: "main";
  owner: string;
  project: string;
  revision: number;
  base?: SyncDocument;
  seed?: SyncDocument;
  lastSync?: string;
  conflict?: {
    revision: number;
    local: SyncDocument;
    remote: SyncDocument;
    paths: string[];
  };
};
export async function readSnapshot(db: PilotDB): Promise<Snapshot> {
  return db.transaction(
    "r",
    [db.state, db.recordings, db.listeningAudio],
    async () => ({
      state: (await db.state.get("main"))?.value ?? defaultState(),
      recordings: await db.recordings.toArray(),
      listeningAudio: await db.listeningAudio.toArray(),
    }),
  );
}
function sameRows(a: Snapshot["recordings"], b: Snapshot["recordings"]) {
  if (a.length !== b.length) return false;
  const indexed = new Map(b.map((r) => [r.id, r]));
  return a.every((r) => {
    const other = indexed.get(r.id);
    return (
      other &&
      r._syncStamp === other._syncStamp &&
      r.title === other.title &&
      r.date === other.date &&
      r.blob.size === other.blob.size &&
      r.blob.type === other.blob.type
    );
  });
}
export async function applySnapshot(
  db: PilotDB,
  expected: Snapshot,
  next: Snapshot,
  meta: SyncMeta,
  guard = () => true,
  expectedMeta?: SyncMeta,
): Promise<boolean> {
  stateSchema.parse(next.state);
  validateRecordings(next.recordings);
  validateRecordings(next.listeningAudio);
  return db.transaction(
    "rw",
    [db.state, db.recordings, db.listeningAudio, db.syncMeta],
    async () => {
      const current = await readSnapshot(db);
      if (
        !guard() ||
        (expectedMeta && !equal(await db.syncMeta.get("main"), expectedMeta)) ||
        !equal(current.state, expected.state) ||
        !sameRows(current.recordings, expected.recordings) ||
        !sameRows(current.listeningAudio, expected.listeningAudio)
      )
        return false;
      if (!equal(current.state, next.state))
        await db.state.put({ id: "main", value: next.state });
      for (const key of ["recordings", "listeningAudio"] as const) {
        const ids = new Set(next[key].map((r) => r.id));
        await db[key].bulkDelete(
          current[key].filter((r) => !ids.has(r.id)).map((r) => r.id),
        );
        const previous = new Map(current[key].map((row) => [row.id, row]));
        await db[key].bulkPut(
          next[key].filter(
            (row) =>
              !previous.has(row.id) ||
              !sameRows([row], [previous.get(row.id)!]),
          ),
        );
      }
      await db.syncMeta.put(meta);
      return true;
    },
  );
}
export async function prepareAccountSpace(
  guest: PilotDB,
  account: PilotDB,
  project: string,
  uid: string,
  importGuest: boolean,
): Promise<void> {
  const old = await account.syncMeta.get("main");
  if (old) {
    if (old.owner !== uid || old.project !== project)
      throw new Error("账号本地空间不匹配");
    return;
  }
  const snapshot = importGuest
    ? await readSnapshot(guest)
    : {
        state: await loadState(today(), account),
        recordings: [],
        listeningAudio: [],
      };
  const seed = importGuest
    ? undefined
    : (await makeDocument(snapshot)).document;
  await account.transaction(
    "rw",
    [
      account.state,
      account.recordings,
      account.listeningAudio,
      account.syncMeta,
    ],
    async () => {
      // Two tabs may attempt first activation concurrently.
      const existing = await account.syncMeta.get("main");
      if (existing) {
        if (existing.owner !== uid || existing.project !== project)
          throw new Error("账号本地空间不匹配");
        return;
      }
      await account.state.put({ id: "main", value: snapshot.state });
      await account.recordings.bulkPut(snapshot.recordings);
      await account.listeningAudio.bulkPut(snapshot.listeningAudio);
      await account.syncMeta.put({
        id: "main",
        owner: uid,
        project,
        revision: 0,
        seed,
      });
    },
  );
}
