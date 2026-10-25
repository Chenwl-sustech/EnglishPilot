import { z } from "zod";
import { userWordSchema, type UserWord } from "./adaptive-model";
import { createFsrsReview, migrateSm2Review, normalizeHeadword } from "./fsrs";
import type { State } from "./model";
import { vocabularyEntries, type VocabularyEntry } from "./vocabulary";

const url = z.string().max(2000).refine((value) => {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return ["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch { return false; }
}, "来源链接必须是 http 或 https 地址");
const source = z.object({
  id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9][\w:.-]*$/),
  name: z.string().trim().min(1).max(300), url,
  license: z.string().trim().min(1).max(3000), licenseUrl: url,
  attribution: z.string().trim().min(1).max(3000),
  modification: z.string().max(3000).default(""),
});
const texts = (max = 100) => z.array(z.string().trim().min(1).max(5000)).max(max).default([]);
const entry = z.object({
  headword: z.string().transform(normalizeHeadword).pipe(z.string().min(1).max(120)),
  meaning: z.string().trim().max(4000).default(""),
  definition: z.string().trim().max(4000).default(""),
  ipa: z.string().trim().max(200).default(""),
  pos: z.string().trim().max(50).default(""),
  examples: texts(20), family: texts(200), collocations: texts(100), synonyms: texts(100),
  sourceIds: z.array(z.string().min(1).max(100)).max(20).default([]),
});
const packSchema = z.object({
  format: z.literal("englishpilot-vocabulary-v1"),
  name: z.string().trim().min(1).max(300),
  sources: z.array(source).min(1).max(20),
  entries: z.array(entry).min(1).max(10000),
}).superRefine((pack, ctx) => {
  const ids = new Set(pack.sources.map((s) => s.id));
  if (ids.size !== pack.sources.length)
    ctx.addIssue({ code: "custom", message: "来源编号不能重复" });
  for (const word of pack.entries)
    if (word.sourceIds.some((id) => !ids.has(id)))
      ctx.addIssue({ code: "custom", message: `${word.headword} 引用了清单中不存在的来源` });
});
export type VocabularyPack = z.infer<typeof packSchema>;
export type VocabularyImportSummary = { added: number; merged: number; unchanged: number; duplicates: number };

export function parseVocabularyPack(raw: string): VocabularyPack {
  if (new TextEncoder().encode(raw).length > 10 * 1024 * 1024)
    throw new Error("词库文件超过 10 MB，请拆分后导入");
  return packSchema.parse(JSON.parse(raw));
}
const unique = (values: string[]) => [...new Map(values.filter(Boolean).map((s) => [normalizeHeadword(s), s])).values()];

/** A full, pure merge: callers commit the returned state in one transaction. */
export function importVocabularyPack(state: State, rawPack: VocabularyPack, now = new Date()) {
  const pack = packSchema.parse(rawPack);
  for (const incoming of pack.sources) {
    const existing = state.extension.sources.find((s) => s.id === incoming.id);
    if (existing && Object.keys(incoming).some((key) => existing[key as keyof typeof existing] !== incoming[key as keyof typeof incoming]))
      throw new Error(`来源编号 ${incoming.id} 已存在且署名或许可不同，请使用独立编号`);
  }
  const existing = new Map(vocabularyEntries(state).map((w) => [normalizeHeadword(w.headword), w]));
  const users = { ...state.extension.userWords }, reviews = { ...state.extension.fsrsReviews };
  const folded = new Map<string, z.infer<typeof entry>>();
  const summary: VocabularyImportSummary = { added: 0, merged: 0, unchanged: 0, duplicates: 0 };
  for (const row of pack.entries) {
    const item = { ...row, sourceIds: row.sourceIds.length ? row.sourceIds : [pack.sources[0].id] };
    const previous = folded.get(item.headword);
    if (!previous) { folded.set(item.headword, item); continue; }
    summary.duplicates++;
    folded.set(item.headword, {
      ...item,
      meaning: previous.meaning || item.meaning, definition: previous.definition || item.definition,
      ipa: previous.ipa || item.ipa, pos: previous.pos || item.pos,
      sourceIds: [...new Set([...previous.sourceIds, ...item.sourceIds])],
      examples: unique([...previous.examples, ...item.examples]), family: unique([...previous.family, ...item.family]),
      collocations: unique([...previous.collocations, ...item.collocations]), synonyms: unique([...previous.synonyms, ...item.synonyms]),
    });
  }
  for (const row of folded.values()) {
    const base = existing.get(row.headword), id = base?.id ?? `personal:${encodeURIComponent(row.headword)}`;
    const fields = { ...(base?.fieldSources ?? {}) };
    for (const key of ["meaning", "definition", "ipa", "pos"] as const)
      if (!base?.[key] && row[key]) fields[key] = row.sourceIds.join("; ");
    fields.headword ??= row.sourceIds.join("; ");
    const word: UserWord = userWordSchema.parse({
      id, headword: row.headword, meaning: base?.meaning || row.meaning, definition: base?.definition || row.definition,
      ipa: base?.ipa || row.ipa, pos: base?.pos || row.pos,
      examples: unique([...(base?.examples ?? []), ...row.examples]),
      family: unique([...(base?.family ?? []), ...row.family]),
      synonyms: unique([...(base?.synonyms ?? []), ...row.synonyms]),
      collocations: unique([...(base?.collocations ?? []), ...row.collocations]),
      sources: [...new Set([...(base?.sources ?? []), ...row.sourceIds])],
      contexts: base?.contexts ?? [], cefr: base?.cefr ?? null, fieldSources: fields,
    });
    if (!base) summary.added++;
    else if (JSON.stringify(users[id]) === JSON.stringify(word)) summary.unchanged++;
    else summary.merged++;
    users[id] = word;
    reviews[id] ??= state.reviews[id] ? migrateSm2Review(state.reviews[id]) : createFsrsReview(now);
  }
  const next: State = {
    ...state, extension: {
      ...state.extension, userWords: users, fsrsReviews: reviews,
      sources: [...state.extension.sources, ...pack.sources.filter((s) => !state.extension.sources.some((old) => old.id === s.id))],
    },
  };
  if (new TextEncoder().encode(JSON.stringify(next)).length > 18 * 1024 * 1024)
    throw new Error("导入后学习数据超过备份安全大小，请拆分或精简词库");
  return { state: next, summary };
}

export function filterVocabulary(entries: VocabularyEntry[], query: string, sourceId = "") {
  const term = normalizeHeadword(query);
  return entries.filter((word) => (!sourceId || word.sources.includes(sourceId)) &&
    (!term || [word.headword, word.meaning, word.definition].some((text) => normalizeHeadword(text).includes(term))));
}
