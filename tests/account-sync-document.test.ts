import { expect, test } from "vitest";
import { defaultState } from "../src/lib/engine";
import { makeDocument, materialize } from "../src/lib/sync/document";
import { mergeDocuments } from "../src/lib/sync/merge";

async function fixture() {
  return (
    await makeDocument({
      state: defaultState("2026-10-26"),
      recordings: [],
      listeningAudio: [],
    })
  ).document;
}

test("independent device attempts merge without losing either attempt", async () => {
  const base = await fixture(),
    local = structuredClone(base),
    remote = structuredClone(base);
  const attempt = {
    skill: "reading" as const,
    contentId: "text",
    date: "2026-10-26",
    createdAt: "2026-10-26T02:00:00Z",
    seconds: 30,
    score: 1,
    answer: "A",
    errors: [],
  };
  local.state.attempts.push({ ...attempt, id: "phone" });
  remote.state.attempts.push({ ...attempt, id: "ipad" });
  const result = mergeDocuments(base, local, remote);
  expect(result.conflicts).toEqual([]);
  expect(result.document?.state.attempts.map((a) => a.id)).toEqual([
    "phone",
    "ipad",
  ]);
});

test("same draft and review card edits remain explicit conflicts", async () => {
  const base = await fixture(),
    local = structuredClone(base),
    remote = structuredClone(base);
  base.state.drafts.essay = "original";
  local.state.drafts.essay = "phone edit";
  remote.state.drafts.essay = "ipad edit";
  expect(mergeDocuments(base, local, remote).conflicts).toContain(
    "state.drafts.essay",
  );
  base.state.reviews.word = {
    interval: 1,
    ease: 2.5,
    repetitions: 0,
    due: "2026-10-26",
    lastDate: "2026-10-26",
  };
  local.state.reviews.word = { ...base.state.reviews.word, interval: 2 };
  remote.state.reviews.word = { ...base.state.reviews.word, repetitions: 1 };
  expect(mergeDocuments(base, local, remote).conflicts).toContain(
    "state.reviews.word",
  );
});

test("deleting an item while another device edits it does not silently discard it", async () => {
  const base = await fixture();
  base.state.tasks = [
    {
      id: "task",
      date: "2026-10-26",
      skill: "reading",
      minutes: 10,
      status: "pending",
    },
  ];
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.state.tasks = [];
  remote.state.tasks[0].status = "done";
  expect(mergeDocuments(base, local, remote).conflicts).toContain(
    "state.tasks[task]",
  );
});

test("different edits cannot create an invalid combined learning allocation", async () => {
  const base = await fixture(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.state.settings.base.writing += 10;
  local.state.settings.base.foundation -= 10;
  remote.state.settings.base.writing += 10;
  remote.state.settings.base.reading -= 10;
  expect(mergeDocuments(base, local, remote).document).toBeUndefined();
});

test("audio larger than one chunk reconstructs original bytes and rejects corrupt downloads", async () => {
  const bytes = new Uint8Array(4 * 1024 * 1024 + 3);
  bytes[0] = 31;
  bytes[bytes.length - 1] = 89;
  const prepared = await makeDocument({
    state: defaultState("2026-10-26"),
    recordings: [
      {
        id: "voice",
        date: "2026-10-26",
        title: "My voice",
        blob: new Blob([bytes], { type: "audio/mp4" }),
      },
    ],
    listeningAudio: [],
  });
  expect(prepared.document.recordings[0].chunks.map((c) => c.size)).toEqual([
    4194304, 3,
  ]);
  const restored = await materialize(prepared.document, async (hash) =>
    prepared.chunks.get(hash)!,
  );
  expect(
    new Uint8Array(await restored.recordings[0].blob.arrayBuffer()),
  ).toEqual(bytes);
  expect(restored.recordings[0].blob.type).toBe("audio/mp4");
  await expect(
    materialize(prepared.document, async () => new Blob(["bad"])),
  ).rejects.toThrow(/校验/);
});

test("ordered conversation arrays conflict rather than fabricate message order", async () => {
  const base = await fixture(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.state.favorites = ["local"];
  remote.state.favorites = ["remote"];
  expect(mergeDocuments(base, local, remote).conflicts).toContain(
    "state.favorites",
  );
});
