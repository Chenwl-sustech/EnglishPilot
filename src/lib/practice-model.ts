import { z } from "zod";
export const practiceLevelSchema = z.enum([
  "foundation",
  "intermediate",
  "advanced",
]);
const skill = z.enum([
  "foundation",
  "listening",
  "reading",
  "writing",
  "speaking",
]);
export const practiceTimingSchema = z.object({
  policy: z.literal("pause-hidden"),
  milliseconds: z.record(z.string(), z.number().int().min(0).max(86400000)),
  paused: z.boolean().default(false),
  lastEventAt: z.iso.datetime(),
  lease: z
    .object({
      owner: z.uuid(),
      questionId: z.string(),
      sequence: z.number().int().min(0),
      expiresAt: z.iso.datetime(),
      lastAt: z.iso.datetime(),
    })
    .nullable()
    .default(null),
});
export const practiceItemSchema = z
  .object({
    id: z.string(),
    materialId: z.string(),
    skill,
    level: practiceLevelSchema,
    kind: z.enum(["choice", "sentence", "writing", "speaking"]),
    questionType: z.string(),
    context: z.string(),
    prompt: z.string(),
    options: z.array(z.string()).default([]),
    correct: z.number().int().min(0).nullable().default(null),
    expected: z.string().default(""),
    explanation: z.string(),
    sourceId: z.string(),
    exam: z.enum(["ielts", "toefl"]).nullable().default(null),
    evidence: z.string().default(""),
    acceptedAnswers: z.array(z.string()).max(40).default([]),
    answerKeys: z.array(z.string()).max(40).default([]),
    distinctGroup: z.string().default(""),
    materialGroup: z.string().default(""),
    audio: z
      .object({
        audioId: z.string().regex(/^[a-f0-9]{64}$/),
        materialId: z.string(),
        revision: z.number().int().min(0),
        title: z.string(),
        publisher: z.string(),
        sourceUrl: z.string(),
        license: z.string(),
        licenseUrl: z.string(),
        duration: z.number().finite().positive().max(7200),
        origin: z.literal("official-sample"),
      })
      .nullable()
      .default(null),
    minWords: z.number().int().min(0).default(0),
    preparationSeconds: z.number().int().min(0).default(0),
    responseSeconds: z.number().int().min(0).default(0),
  })
  .superRefine((item, ctx) => {
    if (
      item.kind === "choice" &&
      (!Number.isInteger(item.correct) ||
        item.correct === null ||
        item.correct >= item.options.length ||
        item.options.length < 2 ||
        new Set(item.options).size !== item.options.length)
    )
      ctx.addIssue({ code: "custom", message: "客观题答案或选项无效" });
    if (item.kind === "sentence" && !item.expected.trim())
      ctx.addIssue({ code: "custom", message: "句子题缺少可验证的答案" });
    if (
      item.answerKeys.length &&
      item.answerKeys.length !== item.acceptedAnswers.length
    )
      ctx.addIssue({ code: "custom", message: "同义答案键不一致" });
  });
export type PracticeItem = z.infer<typeof practiceItemSchema>;
export const practiceSessionSchema = z
  .object({
    id: z.string(),
    kind: z.enum(["weekly", "mock"]),
    exam: z.enum(["ielts", "toefl"]),
    level: practiceLevelSchema,
    paperVersion: z.union([z.literal(1), z.literal(2)]),
    retakeOf: z.string().nullable().default(null),
    scheduledTaskId: z.string().nullable().default(null),
    timing: practiceTimingSchema.nullable().default(null),
    date: z.iso.date(),
    createdAt: z.iso.datetime(),
    status: z.enum(["in-progress", "completed", "abandoned"]),
    sections: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          skill,
          limitSeconds: z.number().int().min(1),
          items: z.array(practiceItemSchema).min(1),
        }),
      )
      .min(1),
    sectionIndex: z.number().int().min(0),
    questionIndex: z.number().int().min(0).default(0),
    sectionStartedAt: z.iso.datetime(),
    deadline: z.iso.datetime(),
    responses: z.record(z.string(), z.string().max(20000)),
    audio: z.record(z.string(), z.string()),
    results: z.array(
      z.object({
        sectionId: z.string(),
        seconds: z.number().int().min(0),
        answered: z.number().int().min(0),
        total: z.number().int().min(1),
        correct: z.number().int().min(0),
        objectiveCount: z.number().int().min(0),
        submittedAt: z.iso.datetime(),
        timedOut: z.boolean(),
        elapsedSeconds: z.number().int().min(0).nullable().default(null),
      }),
    ),
  })
  .superRefine((p, ctx) => {
    const sections = new Set(p.sections.map((s) => s.id)),
      items = p.sections.flatMap((s) => s.items),
      ids = new Set(items.map((i) => i.id));
    if (
      sections.size !== p.sections.length ||
      ids.size !== items.length ||
      p.sectionIndex >= p.sections.length ||
      p.questionIndex >= (p.sections[p.sectionIndex]?.items.length ?? 0)
    )
      ctx.addIssue({ code: "custom", message: "试卷题目重复或分节位置无效" });
    if (
      new Set(p.results.map((r) => r.sectionId)).size !== p.results.length ||
      p.results.some(
        (r) =>
          !sections.has(r.sectionId) ||
          r.correct > r.objectiveCount ||
          r.answered > r.total,
      ) ||
      (p.status === "completed" && p.results.length !== p.sections.length)
    )
      ctx.addIssue({ code: "custom", message: "试卷提交记录不一致" });
    if (
      Object.keys(p.responses).some((id) => !ids.has(id)) ||
      Object.keys(p.audio).some(
        (id) => !items.some((i) => i.id === id && i.kind === "speaking"),
      )
    )
      ctx.addIssue({ code: "custom", message: "回答不属于试卷题目" });
    if (
      p.timing &&
      (Object.keys(p.timing.milliseconds).some((id) => !ids.has(id)) ||
        (p.timing.lease && !ids.has(p.timing.lease.questionId)) ||
        Object.values(p.timing.milliseconds).reduce(
          (n, value) => n + value,
          0,
        ) >
          p.sections.reduce((n, section) => n + section.limitSeconds * 1000, 0))
    )
      ctx.addIssue({ code: "custom", message: "逐题计时与试卷不一致" });
    if (
      p.paperVersion === 2 &&
      p.kind === "weekly" &&
      items.some((i) => i.exam !== p.exam)
    )
      ctx.addIssue({ code: "custom", message: "小测题目考试类型与试卷不一致" });
  });
export type PracticeSession = z.infer<typeof practiceSessionSchema>;
