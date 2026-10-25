import { z } from "zod";
import { extensionSchema, defaultExtension } from "./adaptive-model";

export const skills = [
  "foundation",
  "listening",
  "reading",
  "speaking",
  "writing",
] as const;
export type Skill = (typeof skills)[number];
export const labels: Record<Skill, string> = {
  foundation: "词汇与语法",
  listening: "听力",
  reading: "阅读",
  speaking: "口语",
  writing: "写作",
};
export const dateSchema = z.iso.date();
const allocationSchema = z.object({
  foundation: z.number().int().min(5),
  listening: z.number().int().min(5),
  reading: z.number().int().min(5),
  speaking: z.number().int().min(5),
  writing: z.number().int().min(5),
});
export type Allocation = z.infer<typeof allocationSchema>;
export const settingsSchema = z
  .object({
    dailyMinutes: z.number().int().min(30).max(360),
    base: allocationSchema,
    effective: allocationSchema,
    adaptive: z.boolean(),
    theme: z.enum(["light", "dark"]),
    weeklyDays: z.number().int().min(1).max(7),
  })
  .superRefine((s, ctx) => {
    for (const key of ["base", "effective"] as const)
      if (Object.values(s[key]).reduce((a, b) => a + b, 0) !== s.dailyMinutes)
        ctx.addIssue({
          code: "custom",
          message: "各项分钟合计必须等于每日学习时长",
          path: [key],
        });
  });
export type Settings = z.infer<typeof settingsSchema>;
export const profileSchema = z.object({
  name: z.string().max(40),
  onboarded: z.boolean(),
  startDate: dateSchema,
  examDate: dateSchema,
  mode: z.enum(["dual", "ielts", "toefl"]),
  primary: z.enum(["ielts", "toefl"]),
  primaryShare: z.number().int().min(10).max(90),
  ielts: z.number().min(0).max(9).multipleOf(0.5),
  ieltsListening: z.number().min(0).max(9).multipleOf(0.5),
  ieltsReading: z.number().min(0).max(9).multipleOf(0.5),
  ieltsSpeaking: z.number().min(0).max(9).multipleOf(0.5),
  ieltsWriting: z.number().min(0).max(9).multipleOf(0.5),
  toeflLegacy: z.number().int().min(0).max(120),
  toefl2026: z.number().min(1).max(6).multipleOf(0.5),
  academic: z.boolean(),
});
export type Profile = z.infer<typeof profileSchema>;
export const attemptSchema = z.object({
  id: z.string().min(1),
  activity: z.enum(["dictation", "shadowing"]).optional(),
  skill: z.enum(skills),
  contentId: z.string().min(1),
  date: dateSchema,
  createdAt: z.iso.datetime(),
  seconds: z.number().int().min(0).max(86400),
  score: z.number().min(0).max(1).nullable(),
  answer: z.string().max(100000),
  errors: z.array(z.string().max(10000)).max(100),
});
export type Attempt = z.infer<typeof attemptSchema>;
export const taskSchema = z.object({
  id: z.string(),
  date: dateSchema,
  skill: z.enum(skills),
  minutes: z.number().int().min(1).max(720),
  status: z.enum(["pending", "done", "skipped"]),
});
export type DailyTask = z.infer<typeof taskSchema>;
export const wordReviewSchema = z.object({
  interval: z.number().int().min(1),
  ease: z.number().min(1.3).max(4),
  repetitions: z.number().int().min(0),
  due: dateSchema,
  lastDate: dateSchema,
});
export type WordReview = z.infer<typeof wordReviewSchema>;
export const weeklySchema = z.object({
  id: z.string(),
  date: dateSchema,
  from: dateSchema,
  before: allocationSchema,
  after: allocationSchema,
  reason: z.string(),
  samples: z.record(z.enum(skills), z.number().int().min(0)),
});
export const assessmentSchema = z.object({
  id: z.string(),
  date: dateSchema,
  answers: z.array(z.number().int().min(0)),
  score: z.number().min(0).max(1),
  note: z.string(),
});
export const stateSchema = z.object({
  version: z.literal(3),
  extension: extensionSchema.default(() => defaultExtension()),
  profile: profileSchema,
  settings: settingsSchema,
  scheduleHistory: z
    .array(
      z.object({
        from: dateSchema,
        weeklyDays: z.number().int().min(1).max(7),
      }),
    )
    .default([]),
  lastReviewDate: dateSchema,
  attempts: z.array(attemptSchema),
  tasks: z.array(taskSchema),
  reviews: z.record(z.string(), wordReviewSchema),
  weekly: z.array(weeklySchema),
  drafts: z.record(z.string(), z.string().max(100000)),
  assessments: z.array(assessmentSchema),
  favorites: z.array(z.string()),
});
export type State = z.infer<typeof stateSchema>;
