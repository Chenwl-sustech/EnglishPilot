import { z } from "zod";
import { practiceSessionSchema, practiceLevelSchema } from "./practice-model";
import { teacherSessionSchema } from "./teacher-model";
import { listeningMaterialSchema } from "./listening-material-model";
import {
  calendarRulesSchema,
  dateOverrideSchema,
  holidayYearSchema,
  defaultCalendarRules,
  official2026,
} from "./calendar";
const date = z.iso.date(),
  instant = z.iso.datetime();
export const fourSkills = [
  "listening",
  "reading",
  "writing",
  "speaking",
] as const;
export type FourSkill = (typeof fourSkills)[number];
export const ratiosSchema = z
  .object({
    listening: z.number().min(0).max(100),
    reading: z.number().min(0).max(100),
    writing: z.number().min(0).max(100),
    speaking: z.number().min(0).max(100),
  })
  .refine(
    (r) => Math.abs(Object.values(r).reduce((a, b) => a + b, 0) - 100) < 0.001,
    "四项比例合计必须为 100%",
  );
export type Ratios = z.infer<typeof ratiosSchema>;
export const taskTypes = [
  "new-vocabulary",
  "fsrs-review",
  "grammar",
  "listening",
  "dictation",
  "shadowing",
  "reading",
  "writing",
  "speaking",
  "error-review",
  "mini-test",
  "mock-exam",
] as const;
export const dynamicTaskSchema = z.object({
  id: z.string(),
  type: z.enum(taskTypes),
  skill: z.enum(["foundation", ...fourSkills]),
  exerciseId: z.string(),
  knowledgeKey: z.string(),
  estimatedMinutes: z.number().int().min(1).max(720),
  priority: z.number().int().min(0).max(4),
  difficulty: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  exam: z.enum(["shared", "ielts", "toefl"]),
  scheduledDate: date,
  originalDate: date,
  status: z.enum([
    "pending",
    "running",
    "paused",
    "done",
    "skipped",
    "deferred",
    "cancelled",
  ]),
  actualSeconds: z.number().int().min(0),
  completionIds: z.array(z.string()),
  rescheduleCount: z.number().int().min(0),
  optional: z.boolean(),
  reason: z.string(),
  startedAt: instant.nullable(),
});
export type DynamicTask = z.infer<typeof dynamicTaskSchema>;
export const fsrsCardSchema = z.object({
  due: instant,
  stability: z.number().min(0),
  difficulty: z.number().min(0).max(10),
  elapsed_days: z.number().min(0),
  scheduled_days: z.number().min(0),
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  state: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  last_review: instant.optional(),
  learning_steps: z.number().int().min(0),
});
export const fsrsLogSchema = z.object({
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  state: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  due: instant,
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number(),
  last_elapsed_days: z.number(),
  scheduled_days: z.number(),
  review: instant,
  learning_steps: z.number().optional(),
});
const legacyReview = z.object({
  interval: z.number(),
  ease: z.number(),
  repetitions: z.number(),
  due: date,
  lastDate: date,
});
export const fsrsReviewSchema = z.object({
  algorithm: z.literal("fsrs-6"),
  card: fsrsCardSchema,
  history: z.array(fsrsLogSchema),
  legacy: legacyReview.optional(),
  migration: z.string().optional(),
});
export type StoredFsrsReview = z.infer<typeof fsrsReviewSchema>;
export const sourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  license: z.string(),
  licenseUrl: z.string(),
  attribution: z.string(),
  modification: z.string(),
});
export const userWordSchema = z.object({
  id: z.string(),
  headword: z.string().min(1).max(120),
  ipa: z.string().max(200),
  definition: z.string().max(4000),
  meaning: z.string().max(4000),
  pos: z.string().max(50),
  examples: z.array(z.string().max(5000)),
  collocations: z.array(z.string()),
  synonyms: z.array(z.string()),
  family: z.array(z.string()),
  cefr: z.string().nullable(),
  sources: z.array(z.string()),
  contexts: z.array(
    z.object({ text: z.string().max(5000), source: z.string(), date }),
  ),
  fieldSources: z.record(z.string(), z.string()),
});
export type UserWord = z.infer<typeof userWordSchema>;
export const timingSchema = z.object({
  attemptId: z.string(),
  questionId: z.string(),
  exam: z.enum(["shared", "ielts", "toefl"]),
  questionType: z.string(),
  difficulty: z.string(),
  startedAt: instant,
  seconds: z.number().min(0),
  changes: z.number().int().min(0),
  correct: z.boolean(),
  answer: z.number().int(),
  timingPolicy: z.enum(["pause-hidden", "continue-hidden"]),
});
export type QuestionTimingRecord = z.infer<typeof timingSchema>;
export const mistakeSchema = z.object({
  id: z.string(),
  source: z.string(),
  skill: z.enum(["foundation", ...fourSkills]),
  questionType: z.string(),
  category: z.enum([
    "Grammar",
    "Vocabulary",
    "Coherence & Logic",
    "Task Fulfilment",
    "Spelling",
    "Word Choice",
    "Sentence Structure",
    "Missing Words",
    "Incorrect Words",
    "Extra Words",
    "Comprehension",
  ]),
  original: z.string(),
  response: z.string(),
  correction: z.string(),
  explanation: z.string(),
  count: z.number().int().min(1),
  lastDate: date,
  status: z.enum([
    "pending-confirmation",
    "open",
    "reviewing",
    "resolved",
    "disputed",
  ]),
  nextReview: instant.nullable(),
  attemptIds: z.array(z.string()),
  fsrs: fsrsReviewSchema.optional(),
});
export type UnifiedMistake = z.infer<typeof mistakeSchema>;
export const evaluationSchema = z.object({
  inputText: z.string().max(20000).optional(),
  id: z.string(),
  attemptId: z.string(),
  skill: z.enum(["writing", "speaking"]),
  exam: z.enum(["ielts", "toefl"]),
  taskType: z.string(),
  createdAt: instant,
  kind: z.literal("ai-estimate"),
  model: z.string(),
  rubric: z.string(),
  dimensions: z.array(
    z.object({
      name: z.string(),
      score: z.number().min(0).max(9).nullable(),
      max: z.number().min(1).max(9),
      evidence: z.string(),
    }),
  ),
  normalized: z.number().min(0).max(1).nullable(),
  suggestions: z.array(z.string()).max(3),
  revised: z.string(),
  exemplar: z.string(),
  comparison: z.string(),
  limitations: z.array(z.string()),
  errors: z.array(
    z.object({
      category: mistakeSchema.shape.category,
      original: z.string(),
      explanation: z.string(),
      suggestion: z.string(),
      example: z.string(),
      start: z.number().int().min(0),
      end: z.number().int().min(0),
    }),
  ),
  disputed: z.boolean().default(false),
});
export type Evaluation = z.infer<typeof evaluationSchema>;
export const speechAnalysisSchema = z.object({
  id: z.string(),
  recordingId: z.string(),
  createdAt: instant,
  model: z.string(),
  engine: z.literal("faster-whisper-local"),
  text: z.string(),
  duration: z.number().min(0),
  speechDuration: z.number().min(0),
  wpm: z.number().min(0).nullable(),
  pauseCount: z.number().int().min(0),
  pauseDuration: z.number().min(0),
  repetitions: z.number().int().min(0).nullable(),
  vocabularyDiversity: z.number().min(0).max(1).nullable(),
  segments: z.array(
    z.object({ start: z.number(), end: z.number(), text: z.string() }),
  ),
  words: z.array(
    z.object({
      start: z.number(),
      end: z.number(),
      word: z.string(),
      probability: z.number(),
    }),
  ),
  vad: z.array(z.object({ start: z.number(), end: z.number() })),
  limitations: z.array(z.string()),
});
export type SpeechAnalysis = z.infer<typeof speechAnalysisSchema>;
export const extensionSchema = z.object({
  writingTimers: z
    .record(
      z.string(),
      z.object({
        epoch: z.number().int().min(0),
        seconds: z.number().int().min(0).max(86400),
      }),
    )
    .default({}),
  listeningMaterials: z.array(listeningMaterialSchema).max(2000).default([]),
  teacherSessions: z.array(teacherSessionSchema).default([]),
  studyLevel: z
    .enum(["all", "foundation", "intermediate", "advanced"])
    .default("all"),
  practiceSessions: z.array(practiceSessionSchema).default([]),
  questionOutcomes: z
    .array(
      z.object({
        sessionId: z.string(),
        questionId: z.string(),
        skill: z.enum(["foundation", ...fourSkills]),
        questionType: z.string(),
        level: practiceLevelSchema,
        correct: z.boolean(),
        date,
      }),
    )
    .default([]),
  calendarYears: z.array(holidayYearSchema),
  calendarRules: calendarRulesSchema,
  overrides: z.record(z.string(), dateOverrideSchema),
  calendarChecks: z.array(
    z.object({
      year: z.number().int(),
      checkedAt: instant,
      status: z.enum(["verified", "unverified", "error", "candidate"]),
      source: z.string(),
      message: z.string(),
    }),
  ),
  budgets: z.array(
    z.object({
      date,
      base: z.number(),
      limit: z.number(),
      hardLimit: z.number(),
      optionalReview: z.number(),
      rest: z.boolean(),
      intensive: z.boolean(),
      multiplier: z.number(),
      reason: z.string(),
      calendarVersion: z.string().nullable(),
    }),
  ),
  tasks: z.array(dynamicTaskSchema),
  reschedules: z.array(
    z.object({
      id: z.string(),
      taskId: z.string(),
      from: date,
      to: date.nullable(),
      action: z.enum(["moved", "merged", "deferred", "cancelled"]),
      reason: z.string(),
      createdAt: instant,
    }),
  ),
  recoveries: z.array(
    z.object({
      id: z.string(),
      date,
      missedDays: z.number().int(),
      mode: z.enum(["normal", "catch-up", "compressed", "recovery"]),
      beforeCount: z.number().int(),
      afterCount: z.number().int(),
      beforeMinutes: z.number(),
      afterMinutes: z.number(),
      focus: z.array(z.string()),
      reason: z.string(),
    }),
  ),
  ratios: ratiosSchema,
  allocationMode: z.enum(["base", "adaptive", "manual"]).default("base"),
  plannerConfig: z.object({
    min: z.number().min(5).max(25),
    max: z.number().min(25).max(70),
    weeklyChange: z.number().min(1).max(20),
    sampleMinimum: z.number().int().min(3).max(30),
    windowDays: z.number().int().min(14).max(28),
  }),
  allocations: z.array(
    z.object({
      id: z.string(),
      date,
      from: date,
      before: ratiosSchema,
      after: ratiosSchema,
      samples: z.record(z.string(), z.number()),
      reason: z.string(),
      fatigue: z.boolean(),
    }),
  ),
  lastAllocationDate: date,
  fsrsReviews: z.record(z.string(), fsrsReviewSchema),
  sources: z.array(sourceSchema),
  userWords: z.record(z.string(), userWordSchema),
  timings: z.array(timingSchema),
  readingSessions: z.array(
    z.object({
      attemptId: z.string(),
      startedAt: instant,
      readingSeconds: z.number().min(0),
      answerSeconds: z.number().min(0),
      wordCount: z.number().int().min(0),
      timingPolicy: z.enum(["pause-hidden", "continue-hidden"]),
    }),
  ),
  timingPolicy: z.enum(["pause-hidden", "continue-hidden"]),
  dictations: z.array(
    z.object({
      id: z.string(),
      attemptId: z.string(),
      sentenceId: z.string(),
      reference: z.string(),
      response: z.string(),
      wer: z.number().min(0),
      missing: z.array(z.string()),
      incorrect: z.array(
        z.object({ expected: z.string(), actual: z.string() }),
      ),
      extra: z.array(z.string()),
      createdAt: instant,
    }),
  ),
  shadowing: z.array(
    z.object({
      id: z.string(),
      recordingId: z.string(),
      sentenceId: z.string(),
      reference: z.string(),
      createdAt: instant,
      completed: z.boolean(),
      transcript: z.string().nullable(),
    }),
  ),
  favoriteSentences: z.array(z.string()),
  voicePreference: z.object({
    locale: z.string(),
    voiceURI: z.string(),
    mode: z.enum([
      "device-local",
      "device-online",
      "local-model",
      "system-local",
    ]),
  }),
  whisperModel: z.enum(["tiny", "base", "small"]).default("tiny"),
  evaluations: z.array(evaluationSchema),
  speechAnalyses: z.array(speechAnalysisSchema),
  mistakes: z.array(mistakeSchema),
  mistakeAliases: z.record(z.string(), z.string()).default({}),
  mistakeMerges: z
    .array(
      z.object({
        id: z.string(),
        mergedInto: z.string(),
        createdAt: instant,
        records: z.array(mistakeSchema),
      }),
    )
    .default([]),
  scoreHistory: z.array(
    z.object({
      id: z.string(),
      date,
      exam: z.enum(["ielts", "toefl"]),
      assessmentId: z.string().optional(),
      kind: z.enum(["ai-estimate", "calibrated-mock", "official"]),
      skill: z.enum([...fourSkills, "overall"]),
      score: z.number(),
      max: z.number(),
      sampleCount: z.number().int().min(1),
      source: z.string(),
      complete: z.boolean(),
    }),
  ),
  disputes: z.array(
    z.object({
      id: z.string(),
      targetId: z.string(),
      kind: z.enum(["question", "evaluation"]),
      reason: z.string(),
      createdAt: instant,
    }),
  ),
  selectedTaskId: z.string().nullable(),
  lastScheduleDate: date.nullable(),
});
export type Extension = z.infer<typeof extensionSchema>;
export function defaultExtension(date = "2026-10-15"): Extension {
  return {
    writingTimers: {},
    listeningMaterials: [],
    teacherSessions: [],
    studyLevel: "all",
    practiceSessions: [],
    questionOutcomes: [],
    whisperModel: "tiny",
    calendarYears: [official2026],
    calendarRules: { ...defaultCalendarRules },
    overrides: {},
    calendarChecks: [],
    budgets: [],
    tasks: [],
    reschedules: [],
    recoveries: [],
    ratios: { listening: 25, reading: 25, writing: 25, speaking: 25 },
    allocationMode: "base",
    plannerConfig: {
      min: 15,
      max: 45,
      weeklyChange: 10,
      sampleMinimum: 3,
      windowDays: 21,
    },
    allocations: [],
    lastAllocationDate: date,
    fsrsReviews: {},
    sources: [
      {
        id: "englishpilot-original",
        name: "EnglishPilot 原创示例",
        url: "",
        license: "CC BY 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        attribution: "EnglishPilot",
        modification: "原创释义、例句与音标整理；未引入第三方官方真题。",
      },
      {
        id: "personal",
        name: "用户个人生词",
        url: "",
        license: "个人学习使用",
        licenseUrl: "",
        attribution: "用户录入",
        modification: "保留原文语境与用户填写释义，不自动再分发第三方材料。",
      },
    ],
    userWords: {},
    timings: [],
    readingSessions: [],
    timingPolicy: "pause-hidden",
    dictations: [],
    shadowing: [],
    favoriteSentences: [],
    voicePreference: { locale: "en-US", voiceURI: "", mode: "device-local" },
    evaluations: [],
    speechAnalyses: [],
    mistakes: [],
    mistakeAliases: {},
    mistakeMerges: [],
    scoreHistory: [],
    disputes: [],
    selectedTaskId: null,
    lastScheduleDate: null,
  };
}
