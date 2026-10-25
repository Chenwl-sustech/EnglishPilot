import type { State, Skill } from "./model";
import { recordAttempt } from "./engine";
import { chinaDate } from "./calendar";
import { addMistake } from "./mistakes";
import { curriculumMaterials } from "./curriculum";
import { weeklyExamPool } from "./weekly-exam-bank";
import { selectWeeklyOfficial } from "./weekly-official";
import { measuredSkillSeconds } from "./practice-timing";
import { examWriting, examSpeaking, examWordCompletion } from "./exam-prompts";
import {
  practiceItemSchema,
  practiceSessionSchema,
  type PracticeItem,
  type PracticeSession,
} from "./practice-model";

type Level = PracticeSession["level"];
function hash(text: string) {
  let n = 2166136261;
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
function pool(skill: Skill, exam: PracticeSession["exam"]): PracticeItem[] {
  return curriculumMaterials
    .filter(
      (m) => m.skill === skill && (m.exam === "shared" || m.exam === exam),
    )
    .flatMap((m) =>
      m.questions.map((q) =>
        practiceItemSchema.parse({
          ...q,
          materialId: m.id,
          skill,
          level: m.level,
          kind: "choice",
          questionType: q.questionType,
          context: m.text,
          sourceId: m.sourceId,
        }),
      ),
    );
}
function select(
  s: State,
  items: PracticeItem[],
  count: number,
  seed: string,
  level: Level,
  strictLevel = false,
): PracticeItem[] {
  const recent = new Set(
    s.extension.practiceSessions
      .slice(-4)
      .flatMap((p) => p.sections.flatMap((sec) => sec.items.map((i) => i.id))),
  );
  const errors = new Map<string, { n: number; wrong: number }>();
  for (const q of s.extension.questionOutcomes.slice(-200)) {
    const key = `${q.skill}:${q.questionType}`,
      old = errors.get(key) ?? { n: 0, wrong: 0 };
    old.n++;
    old.wrong += +!q.correct;
    errors.set(key, old);
  }
  const weakness = (i: PracticeItem) => {
    const v = errors.get(`${i.skill}:${i.questionType}`);
    return v && v.n >= 3 ? v.wrong / v.n : 0;
  };
  const candidates = items
    .filter((i) => !strictLevel || i.level === level)
    .sort(
      (a, b) =>
        +recent.has(a.id) - +recent.has(b.id) ||
        +(a.level !== level) - +(b.level !== level) ||
        weakness(b) - weakness(a) ||
        hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`),
    );
  if (candidates.length < count)
    throw new Error("当前级别题库不足，无法生成不重复试卷");
  return candidates.slice(0, count);
}
function install(
  s: State,
  id: string,
  kind: PracticeSession["kind"],
  exam: PracticeSession["exam"],
  level: Level,
  sections: PracticeSession["sections"],
  now: Date,
  extra: Partial<
    Pick<
      PracticeSession,
      "paperVersion" | "retakeOf" | "scheduledTaskId" | "timing"
    >
  > = {},
): State {
  const session = practiceSessionSchema.parse({
    id,
    kind,
    exam,
    level,
    paperVersion: 1,
    date: chinaDate(now),
    createdAt: now.toISOString(),
    status: "in-progress",
    sections,
    sectionIndex: 0,
    sectionStartedAt: now.toISOString(),
    deadline: new Date(
      now.getTime() + sections[0].limitSeconds * 1000,
    ).toISOString(),
    responses: {},
    audio: {},
    results: [],
    ...extra,
  });
  return {
    ...s,
    extension: {
      ...s.extension,
      practiceSessions: [...s.extension.practiceSessions, session],
    },
  };
}
export function startWeekly(
  s: State,
  id: string,
  now = new Date(),
  minutes = 10,
  options: {
    exam?: PracticeSession["exam"];
    level?: Level;
    useOfficialAudio?: boolean;
  } = {},
): State {
  if (s.extension.practiceSessions.some((p) => p.id === id)) return s;
  if (
    !/^mini:[\w:-]+$/.test(id) ||
    id.length > 200 ||
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > 30
  )
    throw new Error("周测参数无效");
  const exam =
    options.exam ??
    (s.profile.mode === "dual" ? s.profile.primary : s.profile.mode);
  const level: Level =
    options.level ??
    (s.extension.studyLevel === "all"
      ? "intermediate"
      : s.extension.studyLevel);
  const bank = weeklyExamPool(exam, level);
  const official =
    options.useOfficialAudio === false
      ? []
      : selectWeeklyOfficial(s, exam, level, id, minutes);
  const chooseBank = (skill: Skill, count: number) => {
    if (!count) return [];
    const items = bank.filter((i) => i.skill === skill);
    if (skill === "foundation")
      return ["grammar", "vocabulary"].flatMap((type) =>
        select(
          s,
          items.filter((i) => i.questionType === type),
          1,
          id,
          level,
          true,
        ),
      );
    const first = select(s, items, 1, id, level, true)[0];
    const group = items.filter((i) => i.materialId === first.materialId);
    return select(
      s,
      group.length >= count ? group : items,
      count,
      id,
      level,
      true,
    );
  };
  const items = (
    [
      ["foundation", 2],
      ["reading", 3],
      ["listening", 3],
    ] as const
  ).flatMap(([skill, n]) =>
    skill === "listening"
      ? [...official, ...chooseBank(skill, n - official.length)]
      : chooseBank(skill, n),
  );
  const task = s.extension.tasks.find(
    (t) =>
      t.type === "mini-test" &&
      t.exerciseId === id &&
      t.scheduledDate === chinaDate(now) &&
      !["done", "cancelled", "deferred", "skipped"].includes(t.status),
  );
  return install(
    s,
    id,
    "weekly",
    exam,
    level,
    [
      {
        id: "weekly",
        title: "本周分级小测",
        skill: "foundation",
        limitSeconds: minutes * 60,
        items,
      },
    ],
    now,
    {
      paperVersion: 2,
      scheduledTaskId: task?.id ?? null,
      timing: {
        policy: "pause-hidden",
        milliseconds: {},
        paused: false,
        lastEventAt: now.toISOString(),
        lease: null,
      },
    },
  );
}
export function startWeeklyRetake(
  s: State,
  parentId: string,
  now = new Date(),
): State {
  const parent = s.extension.practiceSessions.find((p) => p.id === parentId);
  if (!parent || parent.kind !== "weekly") throw new Error("小测记录不存在");
  if (parent.status === "in-progress")
    throw new Error("请先继续或结束当前小测，再另测一套");
  if (
    s.extension.practiceSessions.some(
      (p) => p.retakeOf === parentId && p.status === "in-progress",
    )
  )
    return s;
  const task = s.extension.tasks.find(
    (t) =>
      t.type === "mini-test" &&
      t.scheduledDate === chinaDate(now) &&
      (t.id === parent.scheduledTaskId || t.exerciseId === parent.id) &&
      !["done", "cancelled", "deferred", "skipped"].includes(t.status),
  );
  const minutes = Math.max(
    1,
    Math.min(
      30,
      task?.estimatedMinutes ?? Math.ceil(parent.sections[0].limitSeconds / 60),
    ),
  );
  const next = startWeekly(
    s,
    `mini:retake:${crypto.randomUUID()}`,
    now,
    minutes,
    { exam: parent.exam, level: parent.level },
  );
  const paper = next.extension.practiceSessions.at(-1)!;
  return {
    ...next,
    extension: {
      ...next.extension,
      practiceSessions: next.extension.practiceSessions.map((p) =>
        p.id === paper.id
          ? { ...p, retakeOf: parentId, scheduledTaskId: task?.id ?? null }
          : p,
      ),
    },
  };
}
export function startMock(
  s: State,
  exam: PracticeSession["exam"],
  level: Level,
  now = new Date(),
): State {
  if (
    s.extension.practiceSessions.some(
      (p) => p.kind === "mock" && p.exam === exam && p.status === "in-progress",
    )
  )
    return s;
  const variant = s.extension.practiceSessions.filter(
    (p) => p.kind === "mock" && p.exam === exam,
  ).length;
  const id = `mock:${exam}:${crypto.randomUUID()}`;
  const academicIds = new Set([
    "curr-a-reading-shade",
    "curr-a-reading-archive",
    "curr-a-reading-sediment",
  ]);
  const readingPool = pool("reading", exam).filter((i) =>
    exam === "ielts"
      ? academicIds.has(i.materialId)
      : !academicIds.has(i.materialId),
  );
  const reading = {
    id: "reading",
    title: "Reading",
    skill: "reading" as const,
    limitSeconds: exam === "ielts" ? 3600 : 1800,
    items: [
      ...(exam === "toefl" ? examWordCompletion() : []),
      ...select(
        s,
        readingPool,
        exam === "ielts" ? 40 : 30,
        `${id}:r`,
        level,
      ).sort(
        (a, b) =>
          a.materialId.localeCompare(b.materialId) ||
          a.id.localeCompare(b.id, undefined, { numeric: true }),
      ),
    ],
  };
  const listening = {
    id: "listening",
    title: "Listening",
    skill: "listening" as const,
    limitSeconds: exam === "ielts" ? 1800 : 1740,
    items: select(
      s,
      pool("listening", exam),
      exam === "ielts" ? 40 : 47,
      `${id}:l`,
      level,
    ),
  };
  const writing = {
    id: "writing",
    title: "Writing",
    skill: "writing" as const,
    limitSeconds: exam === "ielts" ? 3600 : 1380,
    items: examWriting(exam, variant),
  };
  const speaking = {
    id: "speaking",
    title: "Speaking",
    skill: "speaking" as const,
    limitSeconds: exam === "ielts" ? 780 : 480,
    items: examSpeaking(exam, variant),
  };
  return install(
    s,
    id,
    "mock",
    exam,
    level,
    exam === "ielts"
      ? [listening, reading, writing, speaking]
      : [reading, listening, writing, speaking],
    now,
  );
}
function current(s: State, id: string) {
  const p = s.extension.practiceSessions.find((p) => p.id === id);
  if (!p) throw new Error("试卷不存在");
  return p;
}
function replace(s: State, p: PracticeSession): State {
  return {
    ...s,
    extension: {
      ...s.extension,
      practiceSessions: s.extension.practiceSessions.map((x) =>
        x.id === p.id ? p : x,
      ),
    },
  };
}
export function savePracticeAnswer(
  s: State,
  id: string,
  itemId: string,
  value: string,
  now = new Date(),
): State {
  const p = current(s, id),
    section = p.sections[p.sectionIndex];
  if (p.status !== "in-progress" || now.getTime() >= Date.parse(p.deadline))
    throw new Error("本节时间已截止，原有答案仍保留");
  const item = section.items.find((i) => i.id === itemId);
  if (!item) throw new Error("题目不属于当前分节");
  if (value.length > 20000) throw new Error("回答超过长度上限");
  if (
    item.kind === "choice" &&
    value !== "" &&
    (!/^\d+$/.test(value) || +value >= item.options.length)
  )
    throw new Error("选项超出范围");
  return replace(s, { ...p, responses: { ...p.responses, [itemId]: value } });
}
export function navigatePracticeQuestion(
  s: State,
  id: string,
  sectionIndex: number,
  questionIndex: number,
): State {
  const p = current(s, id);
  if (p.status !== "in-progress" || p.sectionIndex !== sectionIndex)
    throw new Error("分节状态已更新，请查看当前试卷");
  if (
    !Number.isInteger(questionIndex) ||
    questionIndex < 0 ||
    questionIndex >= p.sections[sectionIndex].items.length
  )
    throw new Error("题目位置无效");
  return replace(s, { ...p, questionIndex });
}
export function attachPracticeRecording(
  s: State,
  id: string,
  itemId: string,
  recordingId: string,
  now = new Date(),
): State {
  const p = current(s, id),
    item = p.sections[p.sectionIndex].items.find((i) => i.id === itemId);
  if (p.status !== "in-progress" || !item || item.kind !== "speaking")
    throw new Error("当前题目不能保存口语录音");
  // Allow a recorder's final data event after expiry; do not let the next section overwrite it.
  if (now.getTime() > Date.parse(p.deadline) + 30000)
    throw new Error("本节已结束，录音可另行下载保留");
  return replace(s, { ...p, audio: { ...p.audio, [itemId]: recordingId } });
}
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[.,!?;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
export function itemCorrect(i: PracticeItem, response: string | undefined) {
  if (i.acceptedAnswers.length) {
    const answer =
      i.kind === "choice" && response !== undefined && /^\d+$/.test(response)
        ? i.options[Number(response)]
        : response;
    return (
      !!answer &&
      i.acceptedAnswers.some(
        (expected) => normalize(expected) === normalize(answer),
      )
    );
  }
  return i.kind === "choice"
    ? response !== undefined &&
        response !== "" &&
        Number(response) === i.correct
    : i.kind === "sentence"
      ? !!response && normalize(response) === normalize(i.expected)
      : false;
}
export function practiceCorrectness(p: PracticeSession, sectionIndex: number) {
  const used = new Map<string, Set<string>>();
  return Object.fromEntries(
    p.sections[sectionIndex].items.map((i) => {
      let correct = itemCorrect(i, p.responses[i.id]);
      if (correct && i.distinctGroup) {
        const response =
          i.kind === "choice"
            ? i.options[Number(p.responses[i.id])]
            : p.responses[i.id];
        const index = i.acceptedAnswers.findIndex(
          (a) => normalize(a) === normalize(response),
        );
        const key = normalize(
          i.answerKeys[index] ?? i.acceptedAnswers[index] ?? response,
        );
        const seen = used.get(i.distinctGroup) ?? new Set<string>();
        correct = !seen.has(key);
        seen.add(key);
        used.set(i.distinctGroup, seen);
      }
      return [i.id, correct];
    }),
  ) as Record<string, boolean>;
}
export function itemAnswered(p: PracticeSession, i: PracticeItem) {
  return i.kind === "speaking" ? !!p.audio[i.id] : !!p.responses[i.id]?.trim();
}

export function submitPracticeSection(
  s: State,
  id: string,
  expectedIndex: number,
  now = new Date(),
  allowIncomplete = false,
): State {
  const p = current(s, id);
  if (p.results.some((r) => r.sectionId === p.sections[expectedIndex]?.id))
    return s;
  if (p.status !== "in-progress" || expectedIndex !== p.sectionIndex)
    throw new Error("分节状态已更新，请刷新查看");
  const sec = p.sections[p.sectionIndex],
    timedOut = now.getTime() >= Date.parse(p.deadline);
  if (
    !timedOut &&
    !allowIncomplete &&
    sec.items.some((i) => !itemAnswered(p, i))
  )
    throw new Error("尚未完成所有题目，请继续作答或明确结束本节");
  const elapsedSeconds = Math.max(
    0,
    Math.min(
      sec.limitSeconds,
      Math.floor((now.getTime() - Date.parse(p.sectionStartedAt)) / 1000),
    ),
  );
  const measured = p.timing ? measuredSkillSeconds(p, p.sectionIndex) : null;
  const seconds = measured
    ? Object.values(measured).reduce((n, value) => n + value, 0)
    : elapsedSeconds;
  const correctness = practiceCorrectness(p, p.sectionIndex);
  const objective = sec.items.filter(
    (i) => i.kind === "choice" || i.kind === "sentence",
  );
  const result = {
    sectionId: sec.id,
    seconds,
    answered: sec.items.filter((i) => itemAnswered(p, i)).length,
    total: sec.items.length,
    correct: objective.filter((i) => correctness[i.id]).length,
    objectiveCount: objective.length,
    submittedAt: now.toISOString(),
    timedOut,
    elapsedSeconds: p.timing ? elapsedSeconds : null,
  };
  let next = replace(s, {
    ...p,
    results: [...p.results, result],
    sectionIndex:
      p.sectionIndex + (p.sectionIndex < p.sections.length - 1 ? 1 : 0),
    status:
      p.sectionIndex === p.sections.length - 1 ? "completed" : "in-progress",
    questionIndex: 0,
    timing: p.timing ? { ...p.timing, lease: null, paused: true } : null,
    sectionStartedAt: now.toISOString(),
    deadline: new Date(
      now.getTime() +
        (p.sections[p.sectionIndex + 1]?.limitSeconds ?? 0) * 1000,
    ).toISOString(),
  });
  const groups: { key: string; skill: Skill; items: PracticeItem[] }[] = [];
  if (p.kind === "weekly")
    for (const skill of ["foundation", "reading", "listening"] as const)
      groups.push({
        key: skill,
        skill,
        items: sec.items.filter((i) => i.skill === skill),
      });
  else if (sec.skill === "writing" || sec.skill === "speaking")
    for (const i of sec.items)
      groups.push({ key: i.id, skill: i.skill, items: [i] });
  else groups.push({ key: sec.skill, skill: sec.skill, items: sec.items });
  let allocated = 0;
  const scheduledTask =
    p.kind === "weekly"
      ? s.extension.tasks.find(
          (t) =>
            t.type === "mini-test" &&
            (t.id === p.scheduledTaskId || t.exerciseId === p.id) &&
            t.scheduledDate === chinaDate(now) &&
            !["done", "skipped", "cancelled", "deferred"].includes(t.status),
        )
      : undefined;
  for (const [index, g] of groups.entries()) {
    const groupSeconds = measured
      ? measured[g.skill]
      : index === groups.length - 1
        ? seconds - allocated
        : Math.floor((seconds * g.items.length) / sec.items.length);
    allocated += groupSeconds;
    const answered = g.items.some((i) => itemAnswered(p, i)),
      obj = g.items.filter((i) => i.kind === "choice" || i.kind === "sentence");
    if (!answered && !obj.length) continue;
    const attemptId =
      g.skill === "speaking"
        ? p.audio[g.items[0].id]
        : `${id}:${sec.id}:${g.key}`;
    if (!attemptId) continue;
    const contentId =
      p.kind === "weekly" &&
      g.skill === "foundation" &&
      result.answered === result.total
        ? (scheduledTask?.exerciseId ?? id)
        : `${id}:${g.key}`;
    next = recordAttempt(next, {
      id: attemptId,
      contentId,
      skill: g.skill,
      date: chinaDate(now),
      createdAt: now.toISOString(),
      seconds: groupSeconds,
      score: obj.length
        ? obj.filter((i) => correctness[i.id]).length / obj.length
        : null,
      answer:
        g.items.length === 1
          ? p.responses[g.items[0].id] || `本地录音：${p.audio[g.items[0].id]}`
          : JSON.stringify(
              Object.fromEntries(
                g.items.map((i) => [i.id, p.responses[i.id] ?? ""]),
              ),
            ),
      errors: [],
    });
    for (const i of obj)
      if (itemAnswered(p, i) && !correctness[i.id])
        next = addMistake(next, {
          source: contentId,
          skill: i.skill,
          questionType: i.questionType,
          category:
            (i.kind === "sentence" && i.skill === "foundation") ||
            i.questionType === "grammar"
              ? "Grammar"
              : i.questionType === "vocabulary"
                ? "Vocabulary"
                : "Comprehension",
          original: i.prompt,
          response: p.responses[i.id],
          correction: i.acceptedAnswers.length
            ? i.acceptedAnswers.join(" / ")
            : i.kind === "choice"
              ? i.options[i.correct!]
              : i.expected,
          explanation: `${i.explanation}${i.distinctGroup && itemCorrect(i, p.responses[i.id]) ? "\n同组答案不能重复；同义写法按同一答案计算。" : ""}\n原文：${i.context}`,
          status: "open",
          attemptIds: [attemptId],
          date: chinaDate(now),
        });
  }
  return {
    ...next,
    extension: {
      ...next.extension,
      tasks: next.extension.tasks.map((t) =>
        p.kind === "weekly" &&
        result.answered === result.total &&
        t.type === "mini-test" &&
        (t.id === scheduledTask?.id || t.exerciseId === id) &&
        t.scheduledDate === chinaDate(now) &&
        !["cancelled", "deferred", "skipped"].includes(t.status)
          ? { ...t, actualSeconds: seconds }
          : t,
      ),
      questionOutcomes: [
        ...next.extension.questionOutcomes,
        ...objective.map((i) => ({
          sessionId: id,
          questionId: i.id,
          skill: i.skill,
          questionType: i.questionType,
          level: i.level,
          correct: correctness[i.id],
          date: chinaDate(now),
        })),
      ],
    },
  };
}
export function abandonPractice(s: State, id: string): State {
  const p = current(s, id);
  if (p.status !== "in-progress") return s;
  return replace(s, { ...p, status: "abandoned" });
}
export function practiceSummary(p: PracticeSession) {
  return p.results.reduce(
    (a, r) => ({
      correct: a.correct + r.correct,
      objectiveCount: a.objectiveCount + r.objectiveCount,
      answered: a.answered + r.answered,
      total: a.total + r.total,
      seconds: a.seconds + r.seconds,
    }),
    { correct: 0, objectiveCount: 0, answered: 0, total: 0, seconds: 0 },
  );
}
