import { readings, type Lesson, type Question } from "./content";
import {
  timingSchema,
  extensionSchema,
  type QuestionTimingRecord,
} from "./adaptive-model";
import { recordAttempt, today } from "./engine";
import type { State } from "./model";
import {curriculumMaterials} from "./curriculum";
import {levelNames} from "./learning-library";

export type TimingPolicy = "pause-hidden" | "continue-hidden";
export type ReadingExam = "shared" | "ielts" | "toefl";
export type ReadingQuestion = Question & {
  id: string;
  questionType: string;
  typeLabel: string;
  evidence: string;
};
export type ReadingLesson = Omit<Lesson, "questions"> & {
  exam: ReadingExam;
  origin: "EnglishPilot 原创示例";
  questions: ReadingQuestion[];
};

const originalTypes = [
  ["detail", "purpose"],
  ["detail", "detail"],
  ["detail", "inference"],
  ["inference", "detail"],
  ["main-idea", "detail"],
  ["detail", "analogy"],
  ["purpose", "detail"],
  ["inference", "detail"],
  ["inference", "author-stance"],
  ["analogy", "detail"],
];
const labels: Record<string, string> = {
  detail: "细节理解",
  purpose: "目的理解",
  inference: "推断",
  "main-idea": "主旨",
  analogy: "类比理解",
  "author-stance": "作者态度",
  "true-false-not-given": "判断 True / False / Not Given",
  "matching-headings": "段落标题匹配",
  "vocabulary-in-context": "语境词义",
  "rhetorical-purpose": "修辞目的",
  "sentence-simplification": "句意简化",
  "matching-heading": "段落标题匹配",
  vocabulary: "语境词义",
  sequence: "信息顺序",
  attitude: "作者态度",
  grammar: "句法理解",
};
const originalEvidence = [
  [
    "They leave home at 8:00 and take a bus.",
    "A volunteer gives them a small notebook and asks them to count birds near the lake.",
  ],
  [
    "During this time, group discussions move to rooms on the ground floor.",
    "A student survey next month will ask whether the new arrangement is helpful.",
  ],
  [
    "If a task is unfinished, he first asks whether it is still necessary.",
    "Leo has not measured his exam performance yet, so he cannot say the new habit has improved his scores.",
  ],
  [
    "However, the streets also differed in traffic and building height.",
    "The researchers plan to measure more streets next year.",
  ],
  [
    "The cell then uses this RNA in the process of making a protein.",
    "This control helps explain why cells with similar DNA can perform different tasks.",
  ],
  [
    "Antibodies are proteins that can bind to particular targets called antigens.",
    "An antibody is therefore more like a selective recognition tool than a general cleaner.",
  ],
  [
    "Before accepting a claim, a reader can examine the study question, the participants, and the comparison group.",
    "It also helps to distinguish an observed association from evidence of causation.",
  ],
  [
    "It may reveal that an effect depends on conditions that were not initially obvious.",
    "Clear methods, accessible materials, and careful reporting help other researchers understand these conditions.",
  ],
  [
    "This variation is one reason a single sample may not capture every feature of the whole tumour.",
    "Further evidence is needed before clinical conclusions are drawn.",
  ],
  [
    "Treating an abstract as a map encourages efficient reading while preserving the need to check the terrain in the full paper.",
    "A reader interested in the strength of the evidence should consult the methods and results, rather than relying only on the final sentence of the abstract.",
  ],
];

function exampleQuestion(
  id: string,
  questionType: string,
  prompt: string,
  options: string[],
  correct: number,
  explanation: string,
  evidence: string,
): ReadingQuestion {
  return {
    id,
    questionType,
    typeLabel: labels[questionType],
    prompt,
    options,
    correct,
    explanation,
    evidence,
  };
}

const examExamples: ReadingLesson[] = [
  {
    id: "r-ielts-judgement",
    title: "Restoring the marsh path",
    level: "B1",
    category: "IELTS 题型训练 · 判断",
    exam: "ielts",
    origin: "EnglishPilot 原创示例",
    text: "The marsh path will close on weekdays in November while volunteers repair its wooden bridge. Visitors can still use the path on Saturdays and Sundays. The visitor centre will remain open every day. Funding comes from a local community grant, and volunteers will carry out the repairs. The notice does not specify when the bridge was originally built.",
    questions: [
      exampleQuestion(
        "r-ielts-judgement:q1",
        "true-false-not-given",
        "The marsh path is available to visitors on Sundays.",
        ["True", "False", "Not Given"],
        0,
        "正文说周六和周日仍可使用小径，因此陈述与原文一致。",
        "Visitors can still use the path on Saturdays and Sundays.",
      ),
      exampleQuestion(
        "r-ielts-judgement:q2",
        "true-false-not-given",
        "The visitor centre will close throughout November.",
        ["True", "False", "Not Given"],
        1,
        "原文明确说游客中心每天照常开放，与题干相反，所以选 False。",
        "The visitor centre will remain open every day.",
      ),
      exampleQuestion(
        "r-ielts-judgement:q3",
        "true-false-not-given",
        "The bridge was first built in 1985.",
        ["True", "False", "Not Given"],
        2,
        "文中没有桥梁建造年份，无法确认 1985 年这一信息，所以选 Not Given。没有信息并不表示年份一定错误。",
        "The notice does not specify when the bridge was originally built.",
      ),
    ],
  },
  {
    id: "r-ielts-headings",
    title: "Sharing a neighbourhood garden",
    level: "B1",
    category: "IELTS 题型训练 · 标题匹配",
    exam: "ielts",
    origin: "EnglishPilot 原创示例",
    text: "[A] Before the garden opened, residents met to agree on common rules. Each household could request one small plot. People without a plot could join the shared herb area. Decisions were made at monthly meetings, so all residents had a way to influence how the space was used.\n[B] The first summer was unusually dry. Gardeners placed barrels beneath shed roofs to collect rainwater. They covered the soil with leaves to reduce water loss and watered the plants early in the morning. These steps helped them use less tap water.",
    questions: [
      exampleQuestion(
        "r-ielts-headings:q1",
        "matching-headings",
        "Choose the best heading for paragraph A.",
        [
          "Organising access and shared decisions",
          "Reducing water use in dry weather",
          "Selling vegetables to distant markets",
        ],
        0,
        "A 段集中说明菜地分配、共享区域及居民参与决策，不涉及节水措施或售卖。",
        "Before the garden opened, residents met to agree on common rules.",
      ),
      exampleQuestion(
        "r-ielts-headings:q2",
        "matching-headings",
        "Choose the best heading for paragraph B.",
        [
          "Organising access and shared decisions",
          "Reducing water use in dry weather",
          "Selling vegetables to distant markets",
        ],
        1,
        "B 段用收集雨水、覆盖土壤和清晨浇水三个措施说明如何减少用水。",
        "These steps helped them use less tap water.",
      ),
    ],
  },
  {
    id: "r-toefl-context",
    title: "Light and museum objects",
    level: "B2",
    category: "TOEFL 题型训练 · 语境与推断",
    exam: "toefl",
    origin: "EnglishPilot 原创示例",
    text: "Museum staff sometimes rotate delicate textiles between display and dark storage. Exposure to light can gradually weaken fibres and fade dyes, and this damage is cumulative: short exposures add to earlier ones rather than starting a new cycle. A textile may look unchanged after one week yet show damage after many displays. Rotation therefore limits an object's total exposure while allowing visitors to see it at intervals. Staff also measure light levels because a bright week and a dim week do not create the same exposure. Dark storage slows further light damage; it does not restore colours that have already faded.",
    questions: [
      exampleQuestion(
        "r-toefl-context:q1",
        "vocabulary-in-context",
        "The word “cumulative” in the passage is closest in meaning to:",
        [
          "building up over time",
          "immediately reversible",
          "visible only at night",
          "unrelated to earlier events",
        ],
        0,
        "冒号后的解释 short exposures add to earlier ones 说明损伤会随时间累积。",
        "short exposures add to earlier ones rather than starting a new cycle",
      ),
      exampleQuestion(
        "r-toefl-context:q2",
        "inference",
        "What can be inferred about storing a faded textile in darkness?",
        [
          "It may slow further damage but will not bring back lost colours.",
          "It immediately returns every dye to its original colour.",
          "It makes future light exposure harmless.",
          "It eliminates the need to measure display lighting.",
        ],
        0,
        "末句同时给出减缓后续损伤和无法恢复褪色两个限制，因此不能推断储藏会修复已有损伤。",
        "Dark storage slows further light damage; it does not restore colours that have already faded.",
      ),
      exampleQuestion(
        "r-toefl-context:q3",
        "rhetorical-purpose",
        "Why does the author compare a bright week with a dim week?",
        [
          "To explain why duration alone cannot measure exposure.",
          "To argue that all museum lighting should be brighter.",
          "To show that damaged fibres repair themselves.",
          "To claim that visitors prefer dim exhibitions.",
        ],
        0,
        "明暗两周的时长相同而光照暴露量不同，这个对比解释了为什么还要测量光照强度。",
        "Staff also measure light levels because a bright week and a dim week do not create the same exposure.",
      ),
    ],
  },
  {
    id: "r-toefl-simplification",
    title: "Tracking a changing coastline",
    level: "B2",
    category: "TOEFL 题型训练 · 句意简化",
    exam: "toefl",
    origin: "EnglishPilot 原创示例",
    text: "Researchers compare photographs taken at different times to study coastal change. Although a single image can reveal the position of a shoreline on one day, a sequence of images is needed to distinguish a lasting change from a temporary shift caused by a storm. Measurements must also account for the tide, since high water can make the shoreline appear farther inland. The team therefore records tidal conditions alongside each photograph. This record helps researchers compare similar conditions before drawing conclusions about long-term movement.",
    questions: [
      exampleQuestion(
        "r-toefl-simplification:q1",
        "sentence-simplification",
        "Which sentence best preserves the essential meaning of the second sentence?",
        [
          "Several images over time help separate lasting shoreline change from short-lived storm effects.",
          "A single photograph always proves that a coastline has changed permanently.",
          "Storms prevent researchers from taking photographs of any coastline.",
          "A sequence of images removes the need to consider when they were taken.",
        ],
        0,
        "原句的核心是：单张照片只反映一天的位置，连续照片才有助于区分长期变化与风暴造成的短暂位移。",
        "a sequence of images is needed to distinguish a lasting change from a temporary shift caused by a storm",
      ),
      exampleQuestion(
        "r-toefl-simplification:q2",
        "detail",
        "Why does the team record tidal conditions?",
        [
          "To compare photographs made under similar water conditions.",
          "To stop coastal storms from occurring.",
          "To replace all photographic measurements.",
          "To establish that every shift lasts for many years.",
        ],
        0,
        "潮汐会影响照片中海岸线的位置，记录潮汐有助于比较相近条件。",
        "This record helps researchers compare similar conditions before drawing conclusions about long-term movement.",
      ),
    ],
  },
];

export const readingLessons: ReadingLesson[] = [
  ...readings.map((lesson, index): ReadingLesson => ({
    ...lesson,
    exam: "shared",
    origin: "EnglishPilot 原创示例",
    questions: lesson.questions.map((question, qIndex) => ({
      ...question,
      id: `${lesson.id}:q${qIndex + 1}`,
      questionType: originalTypes[index][qIndex],
      typeLabel: labels[originalTypes[index][qIndex]],
      evidence: originalEvidence[index][qIndex],
    })),
  })),
  ...examExamples,
  ...curriculumMaterials.filter(m=>m.skill==="reading").map((m):ReadingLesson=>({
    id:m.id,title:m.title,level:levelNames[m.level],category:"原创分级阅读",text:m.text,exam:m.exam,origin:"EnglishPilot 原创示例",
    questions:m.questions.map(q=>({...q,typeLabel:labels[q.questionType]??q.questionType})),
  })),
];

export function validateReadingLesson(lesson: ReadingLesson): void {
  const ids = new Set<string>();
  if (!lesson.text.trim() || !lesson.questions.length)
    throw new Error("阅读材料与题目不能为空");
  for (const question of lesson.questions) {
    if (ids.has(question.id) || !question.id.startsWith(`${lesson.id}:`))
      throw new Error("阅读题目 ID 必须唯一且属于当前材料");
    ids.add(question.id);
    if (
      !question.prompt.trim() ||
      !question.questionType ||
      !question.typeLabel ||
      !question.explanation.trim()
    )
      throw new Error("题型、题干与解析必须完整");
    if (
      question.options.length < 2 ||
      question.options.some((option) => !option.trim()) ||
      new Set(question.options).size !== question.options.length
    )
      throw new Error("答案选项无效");
    if (
      !Number.isInteger(question.correct) ||
      question.correct < 0 ||
      question.correct >= question.options.length
    )
      throw new Error("正确答案索引无效");
    if (!question.evidence.trim() || !lesson.text.includes(question.evidence))
      throw new Error("解析依据必须引用当前阅读原文");
  }
}

export type ReadingQuestionSnapshot = {
  questionId: string;
  startedAt: string | null;
  seconds: number;
  changes: number;
  answer: number | null;
};
export type ReadingSnapshot = {
  lessonId: string;
  startedAt: string;
  timingPolicy: TimingPolicy;
  readingSeconds: number;
  answerSeconds: number;
  activeQuestion: number | null;
  running: boolean;
  effectiveRunning: boolean;
  hidden: boolean;
  questions: ReadingQuestionSnapshot[];
};

/** A single monotonic ledger attributes each interval to exactly one phase. */
export class ReadingSessionClock {
  private cursor: number;
  private readingMilliseconds = 0;
  private questionMilliseconds: number[];
  private questions: Omit<ReadingQuestionSnapshot, "seconds">[];
  private activeQuestion: number | null = null;
  private running = true;
  private hidden = false;
  private readonly startedAt: string;
  private readonly now: () => number;
  private readonly wallNow: () => Date;

  constructor(
    private readonly lesson: ReadingLesson,
    readonly timingPolicy: TimingPolicy = "pause-hidden",
    clocks: { now?: () => number; wallNow?: () => Date } = {},
  ) {
    this.now = clocks.now ?? (() => performance.now());
    this.wallNow = clocks.wallNow ?? (() => new Date());
    this.cursor = this.now();
    this.startedAt = this.wallNow().toISOString();
    this.questionMilliseconds = lesson.questions.map(() => 0);
    this.questions = lesson.questions.map((q) => ({
      questionId: q.id,
      startedAt: null,
      changes: 0,
      answer: null,
    }));
  }

  private effectiveRunning() {
    return (
      this.running && !(this.hidden && this.timingPolicy === "pause-hidden")
    );
  }
  private checkpoint() {
    const current = Math.max(this.cursor, this.now());
    if (this.effectiveRunning()) {
      if (this.activeQuestion === null)
        this.readingMilliseconds += current - this.cursor;
      else
        this.questionMilliseconds[this.activeQuestion] += current - this.cursor;
    }
    this.cursor = current;
  }
  private question(index: number) {
    if (!Number.isInteger(index) || !this.questions[index])
      throw new Error("阅读题目不存在");
    return this.questions[index];
  }
  read() {
    this.checkpoint();
    this.activeQuestion = null;
  }
  selectQuestion(index: number) {
    const question = this.question(index);
    this.checkpoint();
    this.activeQuestion = index;
    question.startedAt ??= this.wallNow().toISOString();
  }
  answer(index: number, answer: number) {
    const question = this.question(index);
    if (
      !Number.isInteger(answer) ||
      answer < 0 ||
      answer >= this.lesson.questions[index].options.length
    )
      throw new Error("请选择有效答案");
    this.selectQuestion(index);
    if (question.answer !== null && question.answer !== answer)
      question.changes++;
    question.answer = answer;
  }
  pause() {
    this.checkpoint();
    this.running = false;
  }
  resume() {
    this.checkpoint();
    this.running = true;
  }
  setHidden(hidden: boolean) {
    this.checkpoint();
    this.hidden = hidden;
  }
  snapshot(): ReadingSnapshot {
    this.checkpoint();
    return {
      lessonId: this.lesson.id,
      startedAt: this.startedAt,
      timingPolicy: this.timingPolicy,
      readingSeconds: this.readingMilliseconds / 1000,
      answerSeconds:
        this.questionMilliseconds.reduce((sum, value) => sum + value, 0) / 1000,
      activeQuestion: this.activeQuestion,
      running: this.running,
      effectiveRunning: this.effectiveRunning(),
      hidden: this.hidden,
      questions: this.questions.map((q, i) => ({
        ...q,
        seconds: this.questionMilliseconds[i] / 1000,
      })),
    };
  }
}

export function readingWordCount(text: string): number {
  return (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/gu) ?? []).length;
}

/** Pure reducer: use once inside useStudy.update / the IndexedDB transaction. */
export function commitReadingAttempt(
  state: State,
  lesson: ReadingLesson,
  snapshot: ReadingSnapshot,
  attemptId: string,
  createdAt = new Date().toISOString(),
): State {
  if (state.attempts.some((attempt) => attempt.id === attemptId)) return state;
  validateReadingLesson(lesson);
  if (
    snapshot.lessonId !== lesson.id ||
    snapshot.questions.length !== lesson.questions.length
  )
    throw new Error("计时记录与阅读材料不匹配");
  const timings = lesson.questions.map(
    (question, index): QuestionTimingRecord => {
      const result = snapshot.questions[index];
      if (result.questionId !== question.id)
        throw new Error("题目计时记录顺序不匹配");
      if (
        result.answer === null ||
        !Number.isInteger(result.answer) ||
        result.answer < 0 ||
        result.answer >= question.options.length ||
        !result.startedAt
      )
        throw new Error("请完成所有阅读题目");
      return timingSchema.parse({
        attemptId,
        questionId: question.id,
        exam: lesson.exam,
        questionType: question.questionType,
        difficulty: lesson.level,
        startedAt: result.startedAt,
        seconds: result.seconds,
        changes: result.changes,
        correct: result.answer === question.correct,
        answer: result.answer,
        timingPolicy: snapshot.timingPolicy,
      });
    },
  );
  const answeringSeconds = timings.reduce(
    (total, timing) => total + timing.seconds,
    0,
  );
  if (Math.abs(answeringSeconds - snapshot.answerSeconds) > 0.001)
    throw new Error("逐题计时与作答总时间不一致");
  const session = extensionSchema.shape.readingSessions.element.parse({
    attemptId,
    startedAt: snapshot.startedAt,
    readingSeconds: snapshot.readingSeconds,
    answerSeconds: snapshot.answerSeconds,
    wordCount: readingWordCount(lesson.text),
    timingPolicy: snapshot.timingPolicy,
  });
  const next = recordAttempt(state, {
    id: attemptId,
    skill: "reading",
    contentId: lesson.id,
    date: today(new Date(createdAt)),
    createdAt,
    seconds: Math.floor(session.readingSeconds + session.answerSeconds + 1e-9),
    score: timings.filter((timing) => timing.correct).length / timings.length,
    answer: JSON.stringify(timings.map((timing) => timing.answer)),
    errors: timings.flatMap((timing, index) => {
      if (timing.correct) return [];
      const question = lesson.questions[index];
      return [
        `${question.prompt}\n你的答案：${question.options[timing.answer]}\n正确答案：${question.options[question.correct]}\n解析：${question.explanation}\n原文依据：${question.evidence}`,
      ];
    }),
  });
  return {
    ...next,
    extension: {
      ...next.extension,
      mistakes: next.extension.mistakes.map((m) => {
        if (!m.attemptIds.includes(attemptId)) return m;
        const q = lesson.questions.find((q) => q.prompt === m.original);
        return q ? { ...m, source: q.id, questionType: q.questionType } : m;
      }),
      timings: [...next.extension.timings, ...timings],
      readingSessions: [...next.extension.readingSessions, session],
    },
  };
}

export type ReadingGroup = {
  exam: ReadingExam;
  questionType: string;
  difficulty: string;
  samples: number;
  accuracy: number;
  meanSeconds: number;
};
export function readingStatistics(state: State) {
  const attempts = new Map(
    state.attempts.filter((a) => a.skill === "reading").map((a) => [a.id, a]),
  );
  const disputed = new Set(
    state.extension.disputes
      .filter((d) => d.kind === "question")
      .map((d) => d.targetId),
  );
  const uniqueTimings = [
    ...new Map(
      state.extension.timings
        .filter((t) => attempts.has(t.attemptId))
        .map((t) => [`${t.attemptId}\0${t.questionId}`, t]),
    ).values(),
  ];
  const timings = uniqueTimings.filter((t) => !disputed.has(t.questionId));
  const grouped = new Map<string, QuestionTimingRecord[]>();
  for (const timing of timings) {
    const key = `${timing.exam}\0${timing.questionType}\0${timing.difficulty}`;
    grouped.set(key, [...(grouped.get(key) ?? []), timing]);
  }
  const groups: ReadingGroup[] = [...grouped.values()]
    .map((records) => ({
      exam: records[0].exam,
      questionType: records[0].questionType,
      difficulty: records[0].difficulty,
      samples: records.length,
      accuracy: records.filter((r) => r.correct).length / records.length,
      meanSeconds: records.reduce((n, r) => n + r.seconds, 0) / records.length,
    }))
    .sort(
      (a, b) =>
        a.exam.localeCompare(b.exam) ||
        a.questionType.localeCompare(b.questionType) ||
        a.difficulty.localeCompare(b.difficulty),
    );
  const sessions = [
    ...new Map(
      state.extension.readingSessions
        .filter((s) => attempts.has(s.attemptId))
        .map((s) => [s.attemptId, s]),
    ).values(),
  ];
  // Tiny or absent reading phases cannot support a useful speed observation.
  const speedSessions = sessions.filter(
    (s) => s.readingSeconds >= 5 && s.wordCount > 0,
  );
  const speedSeconds = speedSessions.reduce((n, s) => n + s.readingSeconds, 0);
  return {
    questions: timings.length,
    accuracy: timings.length
      ? timings.filter((t) => t.correct).length / timings.length
      : null,
    meanQuestionSeconds: timings.length
      ? timings.reduce((n, t) => n + t.seconds, 0) / timings.length
      : null,
    disputedQuestions: uniqueTimings.filter((t) => disputed.has(t.questionId))
      .length,
    sessions: sessions.length,
    speedSamples: speedSessions.length,
    wordsPerMinute: speedSeconds
      ? (speedSessions.reduce((n, s) => n + s.wordCount, 0) * 60) / speedSeconds
      : null,
    readingSeconds: sessions.reduce((n, s) => n + s.readingSeconds, 0),
    answerSeconds: sessions.reduce((n, s) => n + s.answerSeconds, 0),
    groups,
  };
}

export function readingTypeLabel(type: string): string {
  return labels[type] ?? type;
}

export function disputeReadingQuestion(
  state: State,
  questionId: string,
  reason: string,
  createdAt = new Date().toISOString(),
): State {
  const cleanReason = reason.trim();
  if (!cleanReason || cleanReason.length > 2000)
    throw new Error("请填写 1–2000 字的争议原因");
  if (
    !readingLessons.some((lesson) =>
      lesson.questions.some((q) => q.id === questionId),
    )
  )
    throw new Error("阅读题目不存在");
  if (
    state.extension.disputes.some(
      (d) => d.kind === "question" && d.targetId === questionId,
    )
  )
    return state;
  const dispute = extensionSchema.shape.disputes.element.parse({
    id: `reading-dispute:${questionId}`,
    kind: "question",
    targetId: questionId,
    reason: cleanReason,
    createdAt,
  });
  return {
    ...state,
    extension: {
      ...state.extension,
      disputes: [...state.extension.disputes, dispute],
      mistakes: state.extension.mistakes.map((mistake) =>
        mistake.source === questionId
          ? { ...mistake, status: "disputed" as const }
          : mistake,
      ),
    },
  };
}

export type ReadingWordSelection = {
  headword: string;
  context: string;
  source: string;
};
export function selectedReadingWord(
  lesson: ReadingLesson,
  value: string,
): ReadingWordSelection | null {
  const headword = value.trim().replace(/\s+/gu, " ");
  if (
    !headword ||
    headword.length > 120 ||
    !/^[A-Za-z]+(?:['’-][A-Za-z]+)*(?: [A-Za-z]+(?:['’-][A-Za-z]+)*){0,7}$/u.test(
      headword,
    )
  )
    return null;
  const index = lesson.text
    .toLocaleLowerCase("en-US")
    .indexOf(headword.toLocaleLowerCase("en-US"));
  if (index < 0) return null;
  const preceding = lesson.text.lastIndexOf(". ", index);
  const start = preceding < 0 ? 0 : preceding + 2;
  const ending = lesson.text.indexOf(". ", index + headword.length);
  const context = lesson.text
    .slice(start, ending < 0 ? lesson.text.length : ending + 1)
    .trim();
  return { headword, context, source: `阅读 · ${lesson.title}` };
}
