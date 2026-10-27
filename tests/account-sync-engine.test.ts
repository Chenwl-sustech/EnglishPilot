import "fake-indexeddb/auto";
import { afterEach, expect, test } from "vitest";
import { PilotDB } from "../src/lib/db";
import { prepareAccountSpace, readSnapshot } from "../src/lib/sync/local";
import { makeDocument, type SyncDocument } from "../src/lib/sync/document";
import {
  syncOnce,
  resolveConflict,
  type CloudStore,
  type CloudHead,
} from "../src/lib/sync/engine";
const databases: PilotDB[] = [];
const store = () => {
  const db = new PilotDB(`sync-engine-${crypto.randomUUID()}`);
  databases.push(db);
  return db;
};
afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete();
});
class Cloud implements CloudStore {
  readonly owner = "user-a";
  readonly project = "https://example.supabase.co";
  head: CloudHead | null = null;
  chunks = new Map<string, Blob>();
  beforeCommit?: () => Promise<void>;
  async readHead() {
    return structuredClone(this.head);
  }
  async putChunk(hash: string, blob: Blob) {
    this.chunks.set(hash, blob);
  }
  async getChunk(hash: string) {
    const blob = this.chunks.get(hash);
    if (!blob) throw new Error("missing chunk");
    return blob;
  }
  async commit(revision: number, document: SyncDocument) {
    await this.beforeCommit?.();
    if (revision !== (this.head?.revision ?? 0)) return null;
    this.head = { revision: revision + 1, document: structuredClone(document) };
    return this.head.revision;
  }
}
async function setup() {
  const db = store(),
    guest = store(),
    cloud = new Cloud();
  await prepareAccountSpace(guest, db, cloud.project, cloud.owner, false);
  return { db, cloud };
}
test("a second empty device downloads the first device's text and original recording", async () => {
  const { db, cloud } = await setup();
  const state = (await readSnapshot(db)).state;
  state.drafts.essay = "Written on iPad";
  await db.state.put({ id: "main", value: state });
  await db.recordings.put({
    id: "voice",
    date: "2026-10-26",
    title: "Voice",
    blob: new Blob([new Uint8Array([9, 8, 7])], { type: "audio/mp4" }),
  });
  expect((await syncOnce(db, cloud)).status).toBe("synced");
  const phone = store();
  await prepareAccountSpace(store(), phone, cloud.project, cloud.owner, false);
  expect((await syncOnce(phone, cloud)).status).toBe("synced");
  expect((await readSnapshot(phone)).state.drafts.essay).toBe(
    "Written on iPad",
  );
  expect(
    new Uint8Array(
      await (await phone.recordings.get("voice"))!.blob.arrayBuffer(),
    ),
  ).toEqual(new Uint8Array([9, 8, 7]));
});
test("typing during upload remains local and is uploaded on the next sync", async () => {
  const { db, cloud } = await setup();
  cloud.beforeCommit = async () => {
    cloud.beforeCommit = undefined;
    const state = (await readSnapshot(db)).state;
    state.drafts.essay = "Typed during network request";
    await db.state.put({ id: "main", value: state });
  };
  expect((await syncOnce(db, cloud)).status).toBe("pending");
  expect((await readSnapshot(db)).state.drafts.essay).toBe(
    "Typed during network request",
  );
  expect(cloud.head!.document.state.drafts.essay).toBeUndefined();
  await syncOnce(db, cloud);
  expect(cloud.head!.document.state.drafts.essay).toBe(
    "Typed during network request",
  );
});
test("a cloud CAS race is reread and both independent edits survive", async () => {
  const { db, cloud } = await setup();
  await syncOnce(db, cloud);
  const state = (await readSnapshot(db)).state;
  state.drafts.local = "phone";
  await db.state.put({ id: "main", value: state });
  cloud.beforeCommit = async () => {
    cloud.beforeCommit = undefined;
    cloud.head!.revision++;
    cloud.head!.document.state.drafts.remote = "ipad";
  };
  expect((await syncOnce(db, cloud)).status).toBe("synced");
  expect((await readSnapshot(db)).state.drafts).toEqual({
    local: "phone",
    remote: "ipad",
  });
});
test("same draft edits pause, and a stale conflict choice cannot overwrite new work", async () => {
  const { db, cloud } = await setup();
  await syncOnce(db, cloud);
  const state = (await readSnapshot(db)).state;
  state.drafts.essay = "phone";
  await db.state.put({ id: "main", value: state });
  cloud.head!.document.state.drafts.essay = "ipad";
  cloud.head!.revision++;
  expect((await syncOnce(db, cloud)).status).toBe("conflict");
  expect((await syncOnce(db, cloud)).status).toBe("conflict");
  state.drafts.essay = "new local work";
  await db.state.put({ id: "main", value: state });
  await expect(resolveConflict(db, cloud, "cloud")).rejects.toThrow(/变化/);
  expect((await readSnapshot(db)).state.drafts.essay).toBe("new local work");
});
test("explicit cloud choice restores only the reviewed version", async () => {
  const { db, cloud } = await setup();
  await syncOnce(db, cloud);
  const state = (await readSnapshot(db)).state;
  state.drafts.essay = "phone";
  await db.state.put({ id: "main", value: state });
  cloud.head!.document.state.drafts.essay = "ipad";
  cloud.head!.revision++;
  await syncOnce(db, cloud);
  await resolveConflict(db, cloud, "cloud");
  expect((await readSnapshot(db)).state.drafts.essay).toBe("ipad");
  expect((await db.syncMeta.get("main"))?.conflict).toBeUndefined();
});
test("offline and expired session never clear local data", async () => {
  const { db, cloud } = await setup();
  const state = (await readSnapshot(db)).state;
  state.drafts.essay = "Offline work";
  await db.state.put({ id: "main", value: state });
  cloud.readHead = async () => {
    throw new Error("offline");
  };
  await expect(syncOnce(db, cloud)).rejects.toThrow("offline");
  await expect(syncOnce(db, cloud, () => false)).rejects.toThrow(/登录/);
  expect((await readSnapshot(db)).state.drafts.essay).toBe("Offline work");
});
test("logout while committing blocks local application", async () => {
  const { db, cloud } = await setup();
  let loggedIn = true;
  cloud.beforeCommit = async () => {
    loggedIn = false;
  };
  await expect(syncOnce(db, cloud, () => loggedIn)).rejects.toThrow(/登录/);
  expect((await db.syncMeta.get("main"))?.revision).toBe(0);
});
test("corrupt downloaded recording cannot replace an intact local snapshot", async () => {
  const { db, cloud } = await setup();
  const remote = await makeDocument({
    ...(await readSnapshot(db)),
    recordings: [
      {
        id: "bad",
        date: "2026-10-26",
        title: "Bad",
        blob: new Blob(["original"], { type: "audio/mp4" }),
      },
    ],
  });
  cloud.head = { revision: 1, document: remote.document };
  cloud.getChunk = async () => new Blob(["bad"]);
  await expect(syncOnce(db, cloud)).rejects.toThrow(/校验/);
  expect((await readSnapshot(db)).recordings).toHaveLength(0);
  expect((await db.syncMeta.get("main"))?.revision).toBe(0);
});
test("idle sync leaves unchanged recording rows intact", async () => {
  const { db, cloud } = await setup();
  await db.recordings.put({
    id: "voice",
    date: "2026-10-26",
    title: "Voice",
    blob: new Blob(["voice"], { type: "audio/mp4" }),
  });
  await syncOnce(db, cloud);
  const stamp = (await db.recordings.get("voice"))!._syncStamp;
  await syncOnce(db, cloud);
  expect((await db.recordings.get("voice"))!._syncStamp).toBe(stamp);
  expect(cloud.head!.revision).toBe(1);
});
