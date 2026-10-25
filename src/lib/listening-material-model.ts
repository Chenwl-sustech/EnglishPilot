import { z } from "zod";

const webUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    if (!value) return true;
    try {
      const u = new URL(value);
      return (
        ["https:", "http:"].includes(u.protocol) && !u.username && !u.password
      );
    } catch {
      return false;
    }
  }, "来源必须是有效的网页链接");
export const audioSegmentSchema = z.object({
  id: z.string().min(1).max(100),
  start: z.number().finite().min(0),
  end: z.number().finite().positive(),
  text: z.string().trim().min(1).max(10000),
  translation: z.string().max(10000).default(""),
});
export const timelineDraftSchema = z.object({
  id: z.uuid(),
  audioId: z.string().regex(/^[a-f0-9]{64}$/),
  baseRevision: z.number().int().min(0),
  editRevision: z.number().int().min(0).default(0),
  decodedDuration: z.number().finite().positive().max(600),
  model: z.enum(["tiny", "base", "small"]),
  method: z.literal("whisper-word-alignment"),
  createdAt: z.iso.datetime(),
  segments: z.array(audioSegmentSchema).min(1).max(2000),
  coverage: z.number().min(0).max(1),
  omittedSentences: z.number().int().min(0),
});
export type TimelineDraft = z.infer<typeof timelineDraftSchema>;
export const listeningQuestionSchema = z
  .object({
    id: z.string().min(1).max(100),
    kind: z.enum(["choice", "text"]),
    questionType: z.string().min(1).max(100),
    prompt: z.string().trim().min(1).max(5000),
    distinctGroup: z.string().max(100).default(""),
    options: z.array(z.string().min(1).max(3000)).max(12).default([]),
    answers: z.array(z.string().trim().min(1).max(3000)).min(1).max(40),
    answerKeys: z.array(z.string().trim().min(1).max(3000)).max(40).default([]),
    explanation: z.string().max(5000).default(""),
  })
  .superRefine((q, ctx) => {
    if (
      q.prompt.length + q.answers.join(" / ").length + q.explanation.length >
      6000
    )
      ctx.addIssue({
        code: "custom",
        message: "单题题干、答案和解析合计不得超过6000字符，请精简后导入",
      });
    if (q.answerKeys.length && q.answerKeys.length !== q.answers.length)
      ctx.addIssue({
        code: "custom",
        message: "同义答案的标准键必须与答案逐项对应",
      });
    if (
      q.kind === "choice" &&
      (q.options.length < 2 ||
        new Set(q.options).size !== q.options.length ||
        q.answers.some((a) => !q.options.includes(a)))
    )
      ctx.addIssue({
        code: "custom",
        message: "选择题答案必须与选项一致，选项不得重复",
      });
  });
const fields = {
  title: z.string().trim().min(1).max(300),
  exam: z.enum(["ielts", "toefl", "general"]),
  version: z.string().max(100).default(""),
  publisher: z.string().max(300).default("用户个人素材"),
  sourceUrl: webUrl.default(""),
  license: z.string().trim().min(1).max(3000),
  licenseUrl: webUrl.default(""),
  duration: z.number().finite().min(0.1).max(7200),
  transcript: z.string().max(200000).default(""),
  segments: z.array(audioSegmentSchema).max(2000).default([]),
  questions: z.array(listeningQuestionSchema).max(100).default([]),
};
function checkMaterial(
  m: {
    duration: number;
    segments: z.infer<typeof audioSegmentSchema>[];
    questions: z.infer<typeof listeningQuestionSchema>[];
  },
  ctx: z.RefinementCtx,
) {
  if (
    new Set(m.segments.map((s) => s.id)).size !== m.segments.length ||
    new Set(m.questions.map((q) => q.id)).size !== m.questions.length
  )
    ctx.addIssue({ code: "custom", message: "片段或题目编号重复" });
  if (
    m.segments.some(
      (s, i) =>
        s.start >= s.end ||
        s.end > m.duration + 0.05 ||
        (i > 0 && s.start < m.segments[i - 1].end),
    )
  )
    ctx.addIssue({
      code: "custom",
      message: "时间轴必须按顺序排列，不能重叠、倒置或超过音频长度",
    });
}
export const listeningImportSchema = z
  .object(fields)
  .superRefine(checkMaterial);
export type ListeningImport = z.infer<typeof listeningImportSchema>;
export const listeningMaterialSchema = z
  .object({
    ...fields,
    id: z.string().regex(/^listening:[a-f0-9]{64}:(?:ielts|toefl|general)$/),
    audioId: z.string().regex(/^[a-f0-9]{64}$/),
    audioBytes: z
      .number()
      .int()
      .min(1)
      .max(128 * 1024 * 1024),
    mime: z.string().min(1).max(100),
    origin: z.enum(["personal", "official-sample"]),
    catalogId: z.string().nullable(),
    importedAt: z.iso.datetime(),
    revision: z.number().int().min(0),
    audioAvailable: z.boolean().default(true),
    timelineDraft: timelineDraftSchema.nullable().default(null),
    timelineProvenance: z
      .object({
        method: z.enum(["manual", "whisper-word-alignment"]),
        model: z.enum(["tiny", "base", "small"]).nullable(),
        confirmedAt: z.iso.datetime(),
      })
      .nullable()
      .default(null),
  })
  .superRefine((m, ctx) => {
    checkMaterial(m, ctx);
    if (m.timelineDraft) {
      checkMaterial(
        {
          duration: m.timelineDraft.decodedDuration,
          segments: m.timelineDraft.segments,
          questions: [],
        },
        ctx,
      );
      if (
        m.timelineDraft.audioId !== m.audioId ||
        m.timelineDraft.baseRevision !== m.revision
      )
        ctx.addIssue({ code: "custom", message: "时间轴草稿与素材版本不一致" });
    }
  });
export type ListeningMaterial = z.infer<typeof listeningMaterialSchema>;
