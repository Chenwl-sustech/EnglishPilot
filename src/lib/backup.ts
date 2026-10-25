import { z } from "zod";
import type { State } from "./model";
import type { Recording } from "./db";
import { parseBackup } from "./engine";

// A small binary container avoids base64 expansion and preserves original audio.
// Header: 8-byte magic, uint32 manifest length, SHA-256(manifest), then payload.
const magic = new TextEncoder().encode("EPLTBK01");
const headerSize = 44;
const maxArchive = 512 * 1024 * 1024;
const maxManifest = 20 * 1024 * 1024;
const metadata = z.object({
  id: z.string().min(1).max(200),
  date: z.iso.date(),
  title: z.string().max(5000),
  type: z
    .string()
    .max(200)
    .refine(
      (t) => !t || /^(audio\/[\w.+-]+|video\/webm)(;[\w=.+ -]+)*$/i.test(t),
    ),
  size: z
    .number()
    .int()
    .min(1)
    .max(128 * 1024 * 1024),
  offset: z.number().int().min(0),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const manifestSchema = z.object({
  format: z.literal("EnglishPilotCompleteBackup"),
  version: z.union([z.literal(1), z.literal(2)]),
  createdAt: z.iso.datetime(),
  state: z.unknown(),
  recordings: z.array(metadata).max(10000),
  listeningAudio: z.array(metadata).max(2000).optional(),
});
export type BackupContents = {
  format: "complete" | "legacy-json";
  state: State;
  recordings: Recording[] | null;
  listeningAudio?: Recording[] | null;
};
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
async function hash(blob: Blob) {
  return hex(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
}

export function validateRecordings(rows: Recording[]) {
  const ids = new Set<string>();
  if (rows.length > 10000) throw new Error("录音数量超过备份上限");
  let size = 0;
  for (const row of rows) {
    if (!(row.blob instanceof Blob)) throw new Error("录音内容无效");
    metadata
      .omit({ offset: true, sha256: true })
      .parse({ ...row, type: row.blob.type, size: row.blob.size });
    if (ids.has(row.id)) throw new Error("录音 ID 重复，无法安全恢复");
    ids.add(row.id);
    size += row.blob.size;
  }
  if (size > maxArchive)
    throw new Error("完整备份超过 512 MB，请先单独存档部分录音");
}

export async function encodeBackup(
  raw: State,
  recordings: Recording[],
  listeningAudio: Recording[] = [],
): Promise<Blob> {
  const state = parseBackup(JSON.stringify(raw));
  validateRecordings(recordings);
  validateRecordings(listeningAudio);
  let offset = 0;
  const rows = [];
  for (const row of recordings) {
    rows.push({
      id: row.id,
      date: row.date,
      title: row.title,
      type: row.blob.type,
      size: row.blob.size,
      offset,
      sha256: await hash(row.blob),
    });
    offset += row.blob.size;
  }
  const media = [];
  for (const row of listeningAudio) {
    media.push({
      id: row.id,
      date: row.date,
      title: row.title,
      type: row.blob.type,
      size: row.blob.size,
      offset,
      sha256: await hash(row.blob),
    });
    offset += row.blob.size;
  }
  const manifest = new Blob([
    JSON.stringify({
      format: "EnglishPilotCompleteBackup",
      version: 2,
      createdAt: new Date().toISOString(),
      state,
      recordings: rows,
      listeningAudio: media,
    }),
  ]);
  if (
    manifest.size > maxManifest ||
    headerSize + manifest.size + offset > maxArchive
  )
    throw new Error("完整备份超过容量上限（512 MB）");
  const header = new Uint8Array(headerSize);
  header.set(magic);
  new DataView(header.buffer).setUint32(8, manifest.size, false);
  header.set(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await manifest.arrayBuffer()),
    ),
    12,
  );
  return new Blob(
    [
      header,
      manifest,
      ...recordings.map((r) => r.blob),
      ...listeningAudio.map((r) => r.blob),
    ],
    {
      type: "application/octet-stream",
    },
  );
}

export async function decodeBackup(file: Blob): Promise<BackupContents> {
  if (file.size > maxArchive) throw new Error("请选择不超过 512 MB 的完整备份");
  const prefix = new Uint8Array(await file.slice(0, headerSize).arrayBuffer());
  if (!magic.every((b, i) => prefix[i] === b)) {
    if (file.size > 20000000) throw new Error("旧版 JSON 备份不得超过 20 MB");
    return {
      format: "legacy-json",
      state: parseBackup(await file.text()),
      recordings: null,
    };
  }
  if (prefix.length !== headerSize) throw new Error("备份头部损坏");
  const length = new DataView(prefix.buffer).getUint32(8, false);
  if (!length || length > maxManifest || headerSize + length > file.size)
    throw new Error("备份清单损坏或被截断");
  const manifestBlob = file.slice(headerSize, headerSize + length);
  if ((await hash(manifestBlob)) !== hex(prefix.slice(12).buffer))
    throw new Error("备份清单校验失败，文件可能损坏");
  const manifest = manifestSchema.parse(
    JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await manifestBlob.arrayBuffer(),
      ),
    ),
  );
  const state = parseBackup(JSON.stringify(manifest.state));
  if (manifest.version === 2 && !manifest.listeningAudio)
    throw new Error("完整备份缺少导入音频清单");
  const recordings: Recording[] = [];
  const listeningAudio: Recording[] = [];
  let offset = 0;
  for (const row of manifest.recordings) {
    if (
      row.offset !== offset ||
      headerSize + length + offset + row.size > file.size
    )
      throw new Error("录音边界损坏或文件被截断");
    // WebKit can lose a sliced File's offset when IndexedDB persists it.
    // Own the audio bytes before storing them, rather than the backup file.
    const blob = new Blob(
      [
        await file
          .slice(
            headerSize + length + offset,
            headerSize + length + offset + row.size,
          )
          .arrayBuffer(),
      ],
      { type: row.type },
    );
    if ((await hash(blob)) !== row.sha256)
      throw new Error(`录音校验失败：${row.title}`);
    recordings.push({ id: row.id, date: row.date, title: row.title, blob });
    offset += row.size;
  }
  for (const row of manifest.listeningAudio ?? []) {
    if (
      row.offset !== offset ||
      headerSize + length + offset + row.size > file.size
    )
      throw new Error("导入音频边界损坏或被截断");
    const blob = new Blob(
      [
        await file
          .slice(
            headerSize + length + offset,
            headerSize + length + offset + row.size,
          )
          .arrayBuffer(),
      ],
      { type: row.type },
    );
    if ((await hash(blob)) !== row.sha256)
      throw new Error(`导入音频校验失败：${row.title}`);
    listeningAudio.push({ id: row.id, date: row.date, title: row.title, blob });
    offset += row.size;
  }
  if (headerSize + length + offset !== file.size)
    throw new Error("备份包含未声明的额外数据");
  validateRecordings(recordings);
  validateRecordings(listeningAudio);
  return {
    format: "complete",
    state,
    recordings,
    listeningAudio: manifest.version === 2 ? listeningAudio : null,
  };
}
