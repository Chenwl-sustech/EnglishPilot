import { z } from "zod";
import { stateSchema, type State } from "../model";
import { validateRecordings } from "../backup";
import type { Recording } from "../db";

export const chunkBytes = 4 * 1024 * 1024;
const maxBytes = 512 * 1024 * 1024;
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const mediaSchema = z.object({
  id: z.string().min(1).max(200), date: z.iso.date(), title: z.string().max(5000),
  type: z.string().max(200).refine(t => !t || /^(audio\/[\w.+-]+|video\/webm)(;[\w=.+ -]+)*$/i.test(t)),
  size: z.number().int().min(1).max(128 * 1024 * 1024), sha256: digestSchema,
  chunks: z.array(z.object({ hash: digestSchema, size: z.number().int().min(1).max(chunkBytes) })).min(1).max(32),
});
export const documentSchema = z.object({
  version: z.literal(1), state: stateSchema,
  recordings: z.array(mediaSchema).max(10000),
  listeningAudio: z.array(mediaSchema).max(2000),
}).superRefine((doc, ctx) => {
  let total = 0;
  for (const key of ["recordings", "listeningAudio"] as const) {
    const ids = new Set<string>();
    for (const m of doc[key]) {
      total += m.size;
      if (ids.has(m.id) || m.chunks.reduce((n, c) => n + c.size, 0) !== m.size)
        ctx.addIssue({ code: "custom", message: "音频清单重复或长度错误", path: [key] });
      ids.add(m.id);
    }
  }
  if (total > maxBytes || new Blob([JSON.stringify(doc)]).size > 20 * 1024 * 1024)
    ctx.addIssue({ code: "custom", message: "同步数据超过容量上限" });
});
export type SyncDocument = z.infer<typeof documentSchema>;
export type Snapshot = { state: State; recordings: Recording[]; listeningAudio: Recording[] };
export async function sha256(blob: Blob): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())), b => b.toString(16).padStart(2, "0")).join("");
}
export async function makeDocument(snapshot: Snapshot): Promise<{ document: SyncDocument; chunks: Map<string, Blob> }> {
  const chunks = new Map<string, Blob>();
  async function media(rows: Recording[]) {
    validateRecordings(rows);
    const entries = [];
    for (const row of [...rows].sort((a, b) => a.id.localeCompare(b.id))) {
      const parts = [];
      for (let start = 0; start < row.blob.size; start += chunkBytes) {
        const blob = row.blob.slice(start, start + chunkBytes);
        const hash = await sha256(blob);
        chunks.set(hash, blob);
        parts.push({ hash, size: blob.size });
      }
      entries.push({ id: row.id, date: row.date, title: row.title, type: row.blob.type, size: row.blob.size, sha256: await sha256(row.blob), chunks: parts });
    }
    return entries;
  }
  const recordings = await media(snapshot.recordings), listeningAudio = await media(snapshot.listeningAudio);
  const document = documentSchema.parse({ version: 1, state: snapshot.state, recordings, listeningAudio });
  return { document, chunks };
}
export async function materialize(raw: unknown, readChunk: (hash: string) => Promise<Blob>): Promise<Snapshot> {
  const doc = documentSchema.parse(raw);
  // Keep only chunks in this document; never trust a path supplied by the server.
  const cache = new Map<string, Blob>();
  async function media(entries: SyncDocument["recordings"]): Promise<Recording[]> {
    const rows = [];
    for (const entry of entries) {
      const parts = [];
      for (const part of entry.chunks) {
        let blob = cache.get(part.hash);
        if (!blob) {
          blob = await readChunk(part.hash);
          if (blob.size !== part.size || await sha256(blob) !== part.hash) throw new Error("云端音频校验失败，保留本机数据");
          cache.set(part.hash, blob);
        }
        if (blob.size !== part.size) throw new Error("云端音频长度校验失败");
        parts.push(blob);
      }
      const blob = new Blob(parts, { type: entry.type });
      if (blob.size !== entry.size || await sha256(blob) !== entry.sha256) throw new Error("云端录音校验失败，保留本机数据");
      rows.push({ id: entry.id, date: entry.date, title: entry.title, blob });
    }
    return rows;
  }
  return { state: doc.state, recordings: await media(doc.recordings), listeningAudio: await media(doc.listeningAudio) };
}
