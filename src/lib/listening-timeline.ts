import { z } from "zod";
import type { State } from "./model";
import { normalizeDictation, splitListeningSentences } from "./listening";
import {
  listeningMaterialSchema,
  timelineDraftSchema,
  type ListeningMaterial,
  type TimelineDraft,
} from "./listening-material-model";

const recognitionSchema = z.object({
  engine: z.literal("faster-whisper-local"),
  model: z.enum(["tiny", "base", "small"]),
  duration: z.number().finite().positive().max(600),
  words: z
    .array(
      z.object({
        word: z.string().max(200),
        start: z.number().finite().min(0),
        end: z.number().finite().min(0),
        probability: z.number().min(0).max(1).optional(),
      }),
    )
    .min(1)
    .max(6000),
});
/** Exact sequence alignment only: missing words never receive invented times. */
export function buildTimelineDraft(
  material: ListeningMaterial,
  raw: unknown,
  now = new Date(),
): TimelineDraft {
  const result = recognitionSchema.parse(raw);
  if (
    Math.abs(result.duration - material.duration) >
    Math.max(2, material.duration * 0.02)
  )
    throw new Error("转写音频时长与素材不一致");
  if (
    result.words.some(
      (w, i) =>
        w.end < w.start ||
        w.end > result.duration + 0.05 ||
        (i > 0 && w.start < result.words[i - 1].start),
    )
  )
    throw new Error("词级时间戳无效，不能生成时间轴");
  const source = material.transcript.replace(
    /^\s*(?:[AB]:|\([FM]\)\.?|(?:MAN|WOMAN|AGENT|CUSTOMER|LECTURER):)\s*/gm,
    "",
  );
  const sentences = splitListeningSentences(source);
  const ref = sentences.flatMap((s, i) =>
    normalizeDictation(s.text).map((token) => ({ token, sentence: i })),
  );
  const hyp = result.words
    .filter((w) => w.end > w.start && (w.probability ?? 1) >= 0.2)
    .flatMap((w) =>
      normalizeDictation(w.word).map((token) => ({
        token,
        start: w.start,
        end: w.end,
      })),
    );
  const n = ref.length,
    m = hyp.length;
  if (!n || !m || n > 6000 || (n + 1) * (m + 1) > 6000000)
    throw new Error("原文或转写为空、过长，请拆分素材后再生成时间轴");
  const width = m + 1,
    dp = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i * width + j] =
        ref[i].token === hyp[j].token
          ? 1 + dp[(i + 1) * width + j + 1]
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
  const matches = new Map<number, number>();
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (ref[i].token === hyp[j].token) {
      matches.set(i, j);
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) i++;
    else j++;
  }
  let offset = 0,
    aligned = 0;
  const segments: TimelineDraft["segments"] = [];
  for (const sentence of sentences) {
    const count = normalizeDictation(sentence.text).length,
      indices = Array.from({ length: count }, (_, k) => offset + k);
    const hits = indices.filter((k) => matches.has(k));
    const first = matches.get(offset),
      last = matches.get(offset + count - 1);
    if (
      count &&
      hits.length / count >= 0.8 &&
      first !== undefined &&
      last !== undefined
    ) {
      const start = hyp[first].start,
        end = Math.min(result.duration, hyp[last].end);
      if (end > start && start >= (segments.at(-1)?.end ?? 0)) {
        segments.push({
          id: `sentence-${segments.length + 1}`,
          start,
          end,
          text: sentence.text,
          translation: "",
        });
        aligned += hits.length;
      }
    }
    offset += count;
  }
  if (!segments.length)
    throw new Error(
      "原文与识别结果没有可靠的逐句对应，请手工标注或使用更准确的已安装模型",
    );
  return timelineDraftSchema.parse({
    id: crypto.randomUUID(),
    audioId: material.audioId,
    baseRevision: material.revision,
    decodedDuration: result.duration,
    method: "whisper-word-alignment",
    model: result.model,
    createdAt: now.toISOString(),
    segments,
    coverage: aligned / n,
    omittedSentences: sentences.length - segments.length,
  });
}
export function storeTimelineDraft(
  s: State,
  id: string,
  revision: number,
  raw: unknown,
  expectedDraftId?: string | null,
  expectedEditRevision?: number,
): State {
  const old = s.extension.listeningMaterials.find((m) => m.id === id);
  if (!old || old.revision !== revision)
    throw new Error("素材已更新，请重新生成时间轴草稿");
  if (
    expectedDraftId !== undefined &&
    (old.timelineDraft?.id ?? null) !== expectedDraftId
  )
    throw new Error("其他页面已更新草稿，请重新打开后操作");
  if (
    expectedEditRevision !== undefined &&
    old.timelineDraft?.editRevision !== expectedEditRevision
  )
    throw new Error("草稿已在其他页面修改，请重新打开后操作");
  let timelineDraft = timelineDraftSchema.parse(raw);
  if (old.timelineDraft?.id === timelineDraft.id) {
    if (old.timelineDraft.editRevision !== timelineDraft.editRevision)
      throw new Error("草稿已修改，请重新打开后操作");
    timelineDraft = {
      ...timelineDraft,
      editRevision: timelineDraft.editRevision + 1,
    };
  }
  const material = listeningMaterialSchema.parse({ ...old, timelineDraft });
  return {
    ...s,
    extension: {
      ...s.extension,
      listeningMaterials: s.extension.listeningMaterials.map((m) =>
        m.id === id ? material : m,
      ),
    },
  };
}
export function confirmTimelineDraft(
  s: State,
  id: string,
  revision: number,
  draftId: string,
  segments: TimelineDraft["segments"],
  expectedEditRevision = 0,
  now = new Date(),
): State {
  const old = s.extension.listeningMaterials.find((m) => m.id === id);
  if (!old || old.revision !== revision || old.timelineDraft?.id !== draftId)
    throw new Error("素材或草稿已更新，请重新打开后确认");
  if (old.timelineDraft.editRevision !== expectedEditRevision)
    throw new Error("草稿已在其他页面修改，请重新核对后确认");
  if (!segments.length) throw new Error("至少保留一个已校对片段");
  const material = listeningMaterialSchema.parse({
    ...old,
    segments,
    duration: old.timelineDraft.decodedDuration,
    revision: revision + 1,
    timelineDraft: null,
    timelineProvenance: {
      method: "whisper-word-alignment",
      model: old.timelineDraft.model,
      confirmedAt: now.toISOString(),
    },
  });
  return {
    ...s,
    extension: {
      ...s.extension,
      listeningMaterials: s.extension.listeningMaterials.map((m) =>
        m.id === id ? material : m,
      ),
    },
  };
}
