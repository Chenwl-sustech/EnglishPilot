import { announce, type PilotDB } from "../db";
import {
  documentSchema,
  makeDocument,
  materialize,
  type SyncDocument,
  type Snapshot,
} from "./document";
import { readSnapshot, applySnapshot, type SyncMeta } from "./local";
import { equal, mergeDocuments } from "./merge";

export type CloudHead = { revision: number; document: SyncDocument };
export interface CloudStore {
  readonly owner: string;
  readonly project: string;
  readHead(): Promise<CloudHead | null>;
  putChunk(hash: string, blob: Blob): Promise<void>;
  getChunk(hash: string): Promise<Blob>;
  commit(
    expectedRevision: number,
    document: SyncDocument,
  ): Promise<number | null>;
}
export type SyncResult = {
  status: "synced" | "pending" | "conflict";
  revision: number;
  paths?: string[];
};
const check = (guard: () => boolean) => {
  if (!guard()) throw new Error("登录状态已变化，请重新登录后同步");
};
function validateHead(head: CloudHead | null): CloudHead | null {
  if (!head) return null;
  if (!Number.isSafeInteger(head.revision) || head.revision < 1)
    throw new Error("云端同步版本无效");
  return {
    revision: head.revision,
    document: documentSchema.parse(head.document),
  };
}
function hashes(doc: SyncDocument) {
  return new Set(
    [...doc.recordings, ...doc.listeningAudio].flatMap((r) =>
      r.chunks.map((c) => c.hash),
    ),
  );
}
async function metadata(db: PilotDB, cloud: CloudStore, guard: () => boolean) {
  check(guard);
  const meta = await db.syncMeta.get("main");
  if (!meta || meta.owner !== cloud.owner || meta.project !== cloud.project)
    throw new Error("账号与当前学习空间不匹配");
  return meta;
}
async function saveConflict(
  db: PilotDB,
  meta: SyncMeta,
  local: SyncDocument,
  head: CloudHead,
  paths: string[],
  guard: () => boolean,
): Promise<SyncResult> {
  check(guard);
  await db.transaction("rw", db.syncMeta, async () => {
    if (!equal(await db.syncMeta.get("main"), meta))
      throw new Error("另一窗口已更新同步状态，请重试");
    check(guard);
    await db.syncMeta.put({
      ...meta,
      conflict: {
        revision: head.revision,
        local,
        remote: head.document,
        paths,
      },
    });
  });
  return { status: "conflict", revision: head.revision, paths };
}
async function applyCommitted(
  db: PilotDB,
  cloud: CloudStore,
  meta: SyncMeta,
  captured: SyncDocument,
  committed: CloudHead,
  preparedChunks: Map<string, Blob>,
  guard: () => boolean,
): Promise<SyncResult> {
  for (let attempt = 0; attempt < 5; attempt++) {
    check(guard);
    const current = await readSnapshot(db),
      prepared = await makeDocument(current);
    const rebased = mergeDocuments(
      captured,
      prepared.document,
      committed.document,
    );
    if (!rebased.document)
      return saveConflict(
        db,
        meta,
        prepared.document,
        committed,
        rebased.conflicts,
        guard,
      );
    const snapshot = await materialize(
      rebased.document,
      async (hash) =>
        prepared.chunks.get(hash) ??
        preparedChunks.get(hash) ??
        (await cloud.getChunk(hash)),
    );
    for (const key of ["recordings", "listeningAudio"] as const) {
      const previous = new Map(
        prepared.document[key].map((row) => [row.id, row]),
      );
      const rows = new Map(current[key].map((row) => [row.id, row]));
      snapshot[key] = snapshot[key].map((row) =>
        equal(
          previous.get(row.id),
          rebased.document![key].find((m) => m.id === row.id),
        )
          ? rows.get(row.id)!
          : row,
      );
    }
    check(guard);
    const next: SyncMeta = {
      id: "main",
      owner: meta.owner,
      project: meta.project,
      revision: committed.revision,
      base: committed.document,
      lastSync: new Date().toISOString(),
    };
    if (await applySnapshot(db, current, snapshot, next, guard, meta)) {
      if (!equal(prepared.document, rebased.document)) announce();
      return {
        status: equal(rebased.document, committed.document)
          ? "synced"
          : "pending",
        revision: committed.revision,
      };
    }
    // A different tab completed first. Never roll its baseline backwards.
    if (!equal(await db.syncMeta.get("main"), meta))
      throw new Error("另一窗口已更新同步状态，请重试");
  }
  throw new Error(
    "学习内容持续变化，已保留本机数据；请在停止录音或编辑后重试同步",
  );
}
export async function syncOnce(
  db: PilotDB,
  cloud: CloudStore,
  guard = () => true,
): Promise<SyncResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const meta = await metadata(db, cloud, guard);
    if (meta.conflict)
      return {
        status: "conflict",
        revision: meta.conflict.revision,
        paths: meta.conflict.paths,
      };
    const local = await readSnapshot(db),
      prepared = await makeDocument(local);
    const head = validateHead(await cloud.readHead());
    check(guard);
    if (meta.revision && (!head || head.revision < meta.revision))
      throw new Error("云端版本缺失或回退，请先导出本机备份并检查云服务");
    let wanted = prepared.document;
    if (head) {
      const base = meta.base ?? meta.seed;
      if (base) {
        const merged = mergeDocuments(base, prepared.document, head.document);
        if (!merged.document)
          return saveConflict(
            db,
            meta,
            prepared.document,
            head,
            merged.conflicts,
            guard,
          );
        wanted = merged.document;
      } else if (!equal(wanted, head.document))
        return saveConflict(
          db,
          meta,
          prepared.document,
          head,
          ["首次同步：两端都有学习数据"],
          guard,
        );
    }
    // Verify the entire desired snapshot before changing either checkpoint.
    const materialized = await materialize(
      wanted,
      async (hash) => prepared.chunks.get(hash) ?? (await cloud.getChunk(hash)),
    );
    check(guard);
    const known = head ? hashes(head.document) : new Set<string>();
    for (const hash of hashes(wanted)) {
      check(guard);
      if (!known.has(hash)) {
        const blob = prepared.chunks.get(hash);
        if (!blob) throw new Error("本机音频缺失，同步已停止");
        await cloud.putChunk(hash, blob);
      }
    }
    check(guard);
    const revision =
      head && equal(head.document, wanted)
        ? head.revision
        : await cloud.commit(head?.revision ?? 0, wanted);
    check(guard);
    if (revision === null) continue;
    // Include downloaded chunks for rebase without downloading twice.
    const committedChunks = (await makeDocument(materialized)).chunks;
    return applyCommitted(
      db,
      cloud,
      meta,
      prepared.document,
      { revision, document: wanted },
      committedChunks,
      guard,
    );
  }
  throw new Error("另一设备正在保存，请稍后再同步；本机数据已保留");
}
export async function resolveConflict(
  db: PilotDB,
  cloud: CloudStore,
  choice: "local" | "cloud",
  guard = () => true,
): Promise<SyncResult> {
  const meta = await metadata(db, cloud, guard),
    conflict = meta.conflict;
  if (!conflict) throw new Error("当前没有待处理的同步冲突");
  const local = await makeDocument(await readSnapshot(db));
  const head = validateHead(await cloud.readHead());
  check(guard);
  if (
    !head ||
    head.revision !== conflict.revision ||
    !equal(head.document, conflict.remote) ||
    !equal(local.document, conflict.local)
  )
    throw new Error("学习数据已变化，请先重新检查冲突");
  const wanted = choice === "cloud" ? head.document : local.document;
  const snapshot = await materialize(
    wanted,
    async (hash) => local.chunks.get(hash) ?? (await cloud.getChunk(hash)),
  );
  check(guard);
  const known = hashes(head.document);
  for (const hash of hashes(wanted)) {
    check(guard);
    if (!known.has(hash)) await cloud.putChunk(hash, local.chunks.get(hash)!);
  }
  check(guard);
  const revision =
    choice === "cloud"
      ? head.revision
      : await cloud.commit(head.revision, wanted);
  if (revision === null) throw new Error("云端数据已变化，请重新检查冲突");
  check(guard);
  return applyCommitted(
    db,
    cloud,
    meta,
    local.document,
    { revision, document: wanted },
    (await makeDocument(snapshot)).chunks,
    guard,
  );
}
export async function recheckConflict(db: PilotDB): Promise<void> {
  await db.transaction("rw", db.syncMeta, async () => {
    const meta = await db.syncMeta.get("main");
    if (meta) await db.syncMeta.put({ ...meta, conflict: undefined });
  });
}
export async function cloudSnapshot(cloud: CloudStore): Promise<Snapshot> {
  const head = validateHead(await cloud.readHead());
  if (!head) throw new Error("账号还没有云端备份");
  return materialize(head.document, (hash) => cloud.getChunk(hash));
}
