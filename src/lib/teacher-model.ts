import { z } from "zod";

export const teacherModeSchema = z.enum(["free", "scenario", "ielts", "toefl"]);
export const teacherReplySchema = z.object({
  warnings: z.array(z.string().max(1000)).max(3).optional(),
  reply: z.string().trim().min(1).max(4000),
  corrections: z
    .array(
      z.object({
        category: z.enum([
          "Grammar",
          "Vocabulary",
          "Coherence & Logic",
          "Word Choice",
          "Sentence Structure",
        ]),
        original: z.string().trim().min(1).max(1000),
        better: z.string().trim().min(1).max(1500),
        explanation: z.string().trim().min(1).max(1500),
      }),
    )
    .max(3),
  suggestions: z.array(z.string().trim().min(1).max(1000)).max(3),
});
export type TeacherReply = z.infer<typeof teacherReplySchema>;
export const teacherOptionsSchema = z.object({
  mode: teacherModeSchema,
  feedbackMode: z.enum(["coach", "exam"]),
  topic: z.string().trim().min(1).max(300),
  maxTurns: z.number().int().min(1).max(20),
});
export type TeacherOptions = z.infer<typeof teacherOptionsSchema>;
const draftSchema = z.object({
  audioRevision: z.number().int().min(0).default(0),
  id: z.uuid(),
  text: z.string().max(4000),
  recordingId: z.string().nullable(),
  seconds: z.number().int().min(0).max(180),
});
export const teacherSessionSchema = z
  .object({
    id: z.uuid(),
    ...teacherOptionsSchema.shape,
    date: z.iso.date(),
    createdAt: z.iso.datetime(),
    status: z.enum(["active", "completed"]),
    opening: z.string().min(1).max(4000),
    draft: draftSchema,
    turns: z
      .array(
        draftSchema.extend({
          text: z.string().trim().min(1).max(4000),
          requestId: z.uuid(),
          createdAt: z.iso.datetime(),
          response: teacherReplySchema.nullable(),
        }),
      )
      .max(20),
    summaryRequestId: z.uuid().nullable(),
    summary: teacherReplySchema.nullable(),
  })
  .superRefine((s, ctx) => {
    if (
      s.turns.length > s.maxTurns ||
      new Set(s.turns.map((t) => t.id)).size !== s.turns.length ||
      s.turns.slice(0, -1).some((t) => !t.response)
    )
      ctx.addIssue({ code: "custom", message: "对话轮次或待回复状态无效" });
  });
export type TeacherSession = z.infer<typeof teacherSessionSchema>;
export const teacherRequestSchema = teacherOptionsSchema
  .extend({
    sessionId: z.uuid(),
    requestId: z.uuid(),
    action: z.enum(["turn", "summary"]),
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          text: z.string().trim().min(1).max(4000),
        }),
      )
      .min(2)
      .max(41),
  })
  .superRefine((s, ctx) => {
    if (
      s.history.some((h, i) => h.role !== (i % 2 ? "user" : "assistant")) ||
      s.history.filter((h) => h.role === "user").length > s.maxTurns ||
      (s.action === "turn" && s.history.at(-1)?.role !== "user") ||
      s.history.reduce((n, h) => n + h.text.length, 0) > 48000
    )
      ctx.addIssue({
        code: "custom",
        message: "对话历史顺序、轮数或长度无效，请结束后新建练习",
      });
  });
export type TeacherRequest = z.infer<typeof teacherRequestSchema>;
