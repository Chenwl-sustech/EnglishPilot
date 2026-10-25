import type { State } from "./model";
import { recordAttempt, today } from "./engine";
import { addMistake, confirmMistake } from "./mistakes";
import {
  teacherOptionsSchema,
  teacherReplySchema,
  teacherRequestSchema,
  teacherSessionSchema,
  type TeacherOptions,
  type TeacherReply,
  type TeacherSession,
} from "./teacher-model";

const blankDraft = () => ({
  audioRevision: 0,
  id: crypto.randomUUID(),
  text: "",
  recordingId: null as string | null,
  seconds: 0,
});
function get(s: State, id: string) {
  const p = s.extension.teacherSessions.find((p) => p.id === id);
  if (!p) throw new Error("对话不存在，请重新打开历史记录");
  return p;
}
function change(
  s: State,
  id: string,
  fn: (p: TeacherSession) => TeacherSession,
): State {
  const p = teacherSessionSchema.parse(fn(get(s, id)));
  return {
    ...s,
    extension: {
      ...s.extension,
      teacherSessions: s.extension.teacherSessions.map((row) =>
        row.id === id ? p : row,
      ),
    },
  };
}
function editable(p: TeacherSession, draftId: string) {
  if (
    p.status !== "active" ||
    p.draft.id !== draftId ||
    p.turns.some((t) => !t.response) ||
    p.turns.length >= p.maxTurns
  )
    throw new Error("本轮已提交或对话已结束，请先取得待回复结果");
}
export function startTeacher(
  s: State,
  options: TeacherOptions,
  now = new Date(),
): State {
  const o = teacherOptionsSchema.parse(options);
  const opening =
    o.mode === "ielts"
      ? `Let's practise IELTS Speaking. To begin, tell me about yourself and your interest in ${o.topic}.`
      : o.mode === "toefl"
        ? `Let's practise a TOEFL-style interview. What is your experience with ${o.topic}? Give a reason and a specific example.`
        : o.mode === "scenario"
          ? `Let's role-play this situation: ${o.topic}. Tell me what you need and I will respond in character.`
          : `Let's talk about ${o.topic}. What would you like to share?`;
  const p = teacherSessionSchema.parse({
    id: crypto.randomUUID(),
    ...o,
    date: today(now),
    createdAt: now.toISOString(),
    status: "active",
    opening,
    draft: blankDraft(),
    turns: [],
    summary: null,
    summaryRequestId: null,
  });
  return {
    ...s,
    extension: {
      ...s.extension,
      teacherSessions: [...s.extension.teacherSessions, p],
    },
  };
}
export function setTeacherDraft(
  s: State,
  id: string,
  draftId: string,
  text: string,
) {
  return change(s, id, (p) => {
    editable(p, draftId);
    return { ...p, draft: { ...p.draft, text } };
  });
}
export function queueTeacherTurn(
  s: State,
  id: string,
  draftId: string,
  now = new Date(),
) {
  const p = get(s, id);
  if (p.turns.some((t) => t.id === draftId)) return s;
  editable(p, draftId);
  if (!p.draft.text.trim()) throw new Error("请核对转写或输入回答后提交");
  const next = change(s, id, (row) => ({
    ...row,
    turns: [
      ...row.turns,
      {
        ...row.draft,
        text: row.draft.text.trim(),
        requestId: crypto.randomUUID(),
        createdAt: now.toISOString(),
        response: null,
      },
    ],
    draft: blankDraft(),
  }));
  teacherRequest(next, id, "turn");
  return next;
}
export function applyTeacherReply(
  s: State,
  id: string,
  turnId: string,
  requestId: string,
  raw: TeacherReply,
) {
  const response = teacherReplySchema.parse(raw);
  return change(s, id, (p) => {
    const t = p.turns.find((t) => t.id === turnId);
    if (!t || t.requestId !== requestId)
      throw new Error("回复属于过期请求，当前对话未修改");
    if (t.response) return p;
    const turns = p.turns.map((t) =>
      t.id === turnId ? { ...t, response } : t,
    );
    return {
      ...p,
      turns,
      status: turns.length >= p.maxTurns ? "completed" : p.status,
    };
  });
}
export function retryTeacherTurn(s: State, id: string, turnId: string) {
  return change(s, id, (p) => {
    if (p.turns.at(-1)?.id !== turnId || p.turns.at(-1)?.response)
      throw new Error("仅可重新发送最后一条待回复回答");
    return {
      ...p,
      turns: p.turns.map((t) =>
        t.id === turnId ? { ...t, requestId: crypto.randomUUID() } : t,
      ),
    };
  });
}
export function attachTeacherRecording(
  s: State,
  id: string,
  draftId: string,
  recordingId: string,
  seconds: number,
  now = new Date(),
) {
  const p = get(s, id);
  editable(p, draftId);
  const next = change(s, id, (row) => ({
    ...row,
    draft: {
      ...row.draft,
      recordingId,
      seconds:
        row.draft.recordingId === recordingId
          ? Math.max(row.draft.seconds, seconds)
          : seconds,
      audioRevision: row.draft.audioRevision + 1,
    },
  }));
  if (s.attempts.some((a) => a.id === recordingId))
    return {
      ...next,
      attempts: next.attempts.map((a) =>
        a.id === recordingId
          ? { ...a, seconds: Math.max(a.seconds, seconds) }
          : a,
      ),
    };
  return recordAttempt(next, {
    id: recordingId,
    skill: "speaking",
    contentId: `teacher:${p.mode}:${id}`,
    date: today(now),
    createdAt: now.toISOString(),
    seconds,
    score: null,
    answer: `口语对话录音 · ${p.topic}`,
    errors: [],
  });
}
export function finishTeacher(s: State, id: string) {
  return change(s, id, (p) => ({ ...p, status: "completed" }));
}
export function requestTeacherSummary(s: State, id: string, fresh = false) {
  return change(s, id, (p) => {
    if (p.status !== "completed" || !p.turns.length)
      throw new Error("请先完成至少一轮并结束练习");
    return {
      ...p,
      summaryRequestId:
        !fresh && p.summaryRequestId ? p.summaryRequestId : crypto.randomUUID(),
    };
  });
}
export function applyTeacherSummary(
  s: State,
  id: string,
  requestId: string,
  raw: TeacherReply,
) {
  return change(s, id, (p) => {
    if (p.summaryRequestId !== requestId) throw new Error("点评属于过期请求");
    return { ...p, summary: p.summary ?? teacherReplySchema.parse(raw) };
  });
}
export function teacherRequest(
  s: State,
  id: string,
  action: "turn" | "summary",
) {
  const p = get(s, id),
    t = p.turns.at(-1);
  if (
    !t ||
    (action === "turn" && t.response) ||
    (action === "summary" && (!p.summaryRequestId || p.status !== "completed"))
  )
    throw new Error("没有待处理的对话请求");
  return teacherRequestSchema.parse({
    sessionId: p.id,
    mode: p.mode,
    feedbackMode: p.feedbackMode,
    topic: p.topic,
    maxTurns: p.maxTurns,
    action,
    requestId: action === "turn" ? t.requestId : p.summaryRequestId,
    history: [
      { role: "assistant", text: p.opening },
      ...p.turns.flatMap((t) => [
        { role: "user", text: t.text },
        ...(t.response ? [{ role: "assistant", text: t.response.reply }] : []),
      ]),
    ],
  });
}
export function confirmTeacherCorrection(
  s: State,
  id: string,
  turnId: string,
  index: number,
) {
  const p = get(s, id),
    t = p.turns.find((t) => t.id === turnId),
    error = (turnId === "summary" ? p.summary : t?.response)?.corrections[
      index
    ];
  if (!error) throw new Error("纠错记录不存在");
  const next = addMistake(s, {
    source: `teacher:${id}`,
    skill: "speaking",
    questionType: `${p.mode} 对话`,
    category: error.category,
    original: error.original,
    response: error.original,
    correction: error.better,
    explanation: error.explanation,
    status: "open",
    attemptIds: [t?.id ?? id],
    date: p.date,
  });
  const m = next.extension.mistakes.find(
    (m) =>
      m.original === error.original &&
      m.correction === error.better &&
      m.skill === "speaking",
  );
  return m ? confirmMistake(next, m.id) : next;
}
