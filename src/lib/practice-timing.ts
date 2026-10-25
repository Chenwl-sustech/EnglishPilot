import type { State } from "./model";
import type { PracticeSession } from "./practice-model";

const leaseMs = 5000;
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
export function claimPracticeTiming(
  s: State,
  id: string,
  sectionIndex: number,
  questionId: string,
  owner: string,
  now = new Date(),
  takeover = false,
): State {
  const p = s.extension.practiceSessions.find((x) => x.id === id);
  if (
    !p ||
    !p.timing ||
    p.kind !== "weekly" ||
    p.status !== "in-progress" ||
    p.sectionIndex !== sectionIndex ||
    !p.sections[sectionIndex].items.some((i) => i.id === questionId) ||
    now.getTime() >= Date.parse(p.deadline)
  )
    return s;
  const old = p.timing.lease;
  if (
    old &&
    old.owner !== owner &&
    Date.parse(old.expiresAt) > now.getTime() &&
    !takeover
  )
    return s;
  const from = Math.max(now.getTime(), Date.parse(p.timing.lastEventAt));
  return replace(s, {
    ...p,
    timing: {
      ...p.timing,
      paused: false,
      lease: {
        owner,
        questionId,
        sequence: 0,
        lastAt: new Date(from).toISOString(),
        expiresAt: new Date(from + leaseMs).toISOString(),
      },
    },
  });
}
export function recordPracticeTiming(
  s: State,
  id: string,
  owner: string,
  sequence: number,
  deltaMs: number,
  now = new Date(),
  release = false,
  manualPause = false,
): State {
  if (
    !Number.isInteger(deltaMs) ||
    deltaMs < 0 ||
    !Number.isSafeInteger(sequence) ||
    sequence < 1
  )
    throw new Error("无效的逐题计时数据");
  const p = s.extension.practiceSessions.find((x) => x.id === id),
    lease = p?.timing?.lease;
  if (
    !p ||
    !p.timing ||
    !lease ||
    p.status !== "in-progress" ||
    lease.owner !== owner ||
    sequence <= lease.sequence
  )
    return s;
  const end = Math.min(now.getTime(), Date.parse(p.deadline));
  const credit = Math.min(
    deltaMs,
    leaseMs,
    Math.max(
      0,
      Math.min(end, Date.parse(lease.expiresAt)) - Date.parse(lease.lastAt),
    ),
  );
  const section = p.sections[p.sectionIndex];
  if (!section.items.some((i) => i.id === lease.questionId)) return s;
  const used = section.items.reduce(
    (n, i) => n + (p.timing!.milliseconds[i.id] ?? 0),
    0,
  );
  const milliseconds = {
    ...p.timing.milliseconds,
    [lease.questionId]:
      (p.timing.milliseconds[lease.questionId] ?? 0) +
      Math.min(credit, Math.max(0, section.limitSeconds * 1000 - used)),
  };
  const lastAt = Math.max(Date.parse(lease.lastAt), end);
  return replace(s, {
    ...p,
    timing: {
      ...p.timing,
      milliseconds,
      paused: manualPause || p.timing.paused,
      lastEventAt: new Date(
        Math.max(Date.parse(p.timing.lastEventAt), lastAt),
      ).toISOString(),
      lease:
        release || now.getTime() >= Date.parse(p.deadline)
          ? null
          : {
              ...lease,
              sequence,
              lastAt: new Date(lastAt).toISOString(),
              expiresAt: new Date(lastAt + leaseMs).toISOString(),
            },
    },
  });
}

/** Rounded once globally, so fractional seconds across questions are never double counted. */
export function measuredSkillSeconds(p: PracticeSession, sectionIndex: number) {
  const section = p.sections[sectionIndex];
  const skills = [
    "foundation",
    "reading",
    "listening",
    "writing",
    "speaking",
  ] as const;
  const ms = skills.map((skill) =>
    section.items
      .filter((i) => i.skill === skill)
      .reduce((n, i) => n + (p.timing?.milliseconds[i.id] ?? 0), 0),
  );
  const seconds = ms.map((n) => Math.floor(n / 1000));
  let remainder =
    Math.floor(ms.reduce((n, v) => n + v, 0) / 1000) -
    seconds.reduce((n, v) => n + v, 0);
  for (const { index } of ms
    .map((value, index) => ({ index, fraction: value % 1000 }))
    .sort((a, b) => b.fraction - a.fraction))
    if (remainder-- > 0) seconds[index]++;
  return Object.fromEntries(
    skills.map((skill, index) => [skill, seconds[index]]),
  ) as Record<(typeof skills)[number], number>;
}
