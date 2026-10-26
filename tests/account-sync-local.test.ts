import "fake-indexeddb/auto";
import { afterEach, expect, test } from "vitest";
import { PilotDB } from "../src/lib/db";
import { defaultState } from "../src/lib/engine";
import Dexie from "dexie";
import {
  prepareAccountSpace,
  readSnapshot,
  applySnapshot,
} from "../src/lib/sync/local";

const opened: PilotDB[] = [];
const store = () => {
  const db = new PilotDB(`sync-test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
};
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});
const audio = (value: number) => ({
  id: "voice",
  date: "2026-10-26",
  title: "Voice",
  blob: new Blob([new Uint8Array([value])], { type: "audio/mp4" }),
});

test("copying guest to account A retains original and never fills account B", async () => {
  const guest = store(),
    a = store(),
    b = store();
  const state = defaultState("2026-10-26");
  state.profile.name = "Guest";
  await guest.state.put({ id: "main", value: state });
  await guest.recordings.put(audio(42));
  await prepareAccountSpace(
    guest,
    a,
    "https://example.supabase.co",
    "user-a",
    true,
  );
  await prepareAccountSpace(
    guest,
    b,
    "https://example.supabase.co",
    "user-b",
    false,
  );
  expect((await readSnapshot(guest)).state.profile.name).toBe("Guest");
  expect((await readSnapshot(a)).recordings).toHaveLength(1);
  expect((await readSnapshot(b)).recordings).toHaveLength(0);
  expect((await readSnapshot(b)).state.profile.name).toBe("学习者");
  await expect(
    prepareAccountSpace(
      guest,
      a,
      "https://example.supabase.co",
      "user-b",
      true,
    ),
  ).rejects.toThrow(/账号/);
});

test("compare-and-apply preserves edits made after the network snapshot", async () => {
  const db = store();
  await db.state.put({ id: "main", value: defaultState("2026-10-26") });
  const before = await readSnapshot(db);
  const next = structuredClone(before);
  next.state.profile.name = "Cloud";
  const current = structuredClone(before.state);
  current.drafts.essay = "Typing while syncing";
  await db.state.put({ id: "main", value: current });
  expect(
    await applySnapshot(db, before, next, {
      id: "main",
      owner: "a",
      project: "https://example.supabase.co",
      revision: 1,
    }),
  ).toBe(false);
  expect((await readSnapshot(db)).state.drafts.essay).toBe(
    "Typing while syncing",
  );
});

test("replacing audio with equal length bytes prevents stale sync application", async () => {
  const db = store();
  await db.state.put({ id: "main", value: defaultState("2026-10-26") });
  await db.recordings.put(audio(1));
  const before = await readSnapshot(db);
  await db.recordings.put(audio(2));
  expect(
    await applySnapshot(db, before, before, {
      id: "main",
      owner: "a",
      project: "p",
      revision: 1,
    }),
  ).toBe(false);
  expect(
    new Uint8Array(
      await (await db.recordings.get("voice"))!.blob.arrayBuffer(),
    ),
  ).toEqual(new Uint8Array([2]));
});

test("successful local application atomically persists baseline and all audio", async () => {
  const db = store();
  await db.state.put({ id: "main", value: defaultState("2026-10-26") });
  const before = await readSnapshot(db),
    next = structuredClone(before);
  next.state.profile.name = "Synced";
  next.recordings = [audio(8)];
  expect(
    await applySnapshot(db, before, next, {
      id: "main",
      owner: "a",
      project: "p",
      revision: 7,
    }),
  ).toBe(true);
  expect((await db.syncMeta.get("main"))?.revision).toBe(7);
  expect((await readSnapshot(db)).state.profile.name).toBe("Synced");
  expect((await readSnapshot(db)).recordings).toHaveLength(1);
});
test("database upgrade retains existing version-four learning data and untagged audio", async () => {
  const name = `sync-upgrade-${crypto.randomUUID()}`, old = new Dexie(name);
  old.version(4).stores({ state: "id", recordings: "id,date", listeningAudio: "id,date" });
  const state = defaultState("2026-10-26"); state.drafts.essay = "Existing iPad work";
  await old.table("state").put({ id: "main", value: state });
  await old.table("recordings").put(audio(66)); old.close();
  const upgraded = new PilotDB(name); opened.push(upgraded);
  const before = await readSnapshot(upgraded);
  expect(before.state.drafts.essay).toBe("Existing iPad work");
  expect(new Uint8Array(await before.recordings[0].blob.arrayBuffer())).toEqual(new Uint8Array([66]));
  expect(before.recordings[0]._syncStamp).toBeUndefined();
  await upgraded.recordings.put(audio(67));
  expect(await applySnapshot(upgraded, before, before, { id: "main", owner: "a", project: "p", revision: 1 })).toBe(false);
});
