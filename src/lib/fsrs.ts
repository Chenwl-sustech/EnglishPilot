import {
  clamp,
  createEmptyCard,
  default_w,
  fsrs,
  Rating,
  S_MAX,
  S_MIN,
  State as CardState,
  type Card,
  type DateInput,
  type Grade,
  type RecordLogItem,
  type ReviewLog,
} from "ts-fsrs";
import { fsrsReviewSchema, userWordSchema } from "./adaptive-model";
import type { StoredFsrsReview, UserWord } from "./adaptive-model";
import { shiftDate } from "./calendar";
import { vocabularyEntries } from "./vocabulary";
import type { Attempt, State, WordReview } from "./model";

export type ReviewRating = "again" | "hard" | "good" | "easy";
export type PersonalWordInput = Partial<Omit<UserWord, "id" | "headword">> & {
  headword: string;
};

const ratings: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};
const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: false });

function instant(value: DateInput): Date {
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw new Error("复习时间无效");
  return result;
}

function serializeCard(card: Card): StoredFsrsReview["card"] {
  const { last_review, ...rest } = card;
  return {
    ...rest,
    due: card.due.toISOString(),
    ...(last_review ? { last_review: last_review.toISOString() } : {}),
  };
}

function serializeLog(log: ReviewLog): StoredFsrsReview["history"][number] {
  if (log.rating === Rating.Manual)
    throw new Error("不支持将手动改期视为回忆评分");
  return {
    ...log,
    rating: log.rating,
    due: log.due.toISOString(),
    review: log.review.toISOString(),
  };
}

function reviewResult(
  previous: StoredFsrsReview | undefined,
  item: RecordLogItem,
): StoredFsrsReview {
  return fsrsReviewSchema.parse({
    ...previous,
    algorithm: "fsrs-6",
    card: serializeCard(item.card),
    history: [...(previous?.history ?? []), serializeLog(item.log)],
  });
}

export function createFsrsReview(
  now: DateInput = new Date(),
): StoredFsrsReview {
  return {
    algorithm: "fsrs-6",
    card: serializeCard(createEmptyCard(instant(now))),
    history: [],
  };
}

/** All memory updates are delegated to the installed ts-fsrs scheduler. */
export function reviewFsrs(
  previous: StoredFsrsReview | undefined,
  rating: ReviewRating,
  now: DateInput = new Date(),
): StoredFsrsReview {
  if (!Object.hasOwn(ratings, rating)) throw new Error("复习评分无效");
  const date = instant(now);
  return reviewResult(
    previous,
    scheduler.next(
      previous?.card ?? createEmptyCard(date),
      date,
      ratings[rating],
    ),
  );
}

export function previewFsrs(
  previous: StoredFsrsReview | undefined,
  now: DateInput = new Date(),
): Record<ReviewRating, StoredFsrsReview> {
  const date = instant(now);
  const options = scheduler.repeat(
    previous?.card ?? createEmptyCard(date),
    date,
  );
  return {
    again: reviewResult(previous, options[Rating.Again]),
    hard: reviewResult(previous, options[Rating.Hard]),
    good: reviewResult(previous, options[Rating.Good]),
    easy: reviewResult(previous, options[Rating.Easy]),
  };
}

export function retrievability(
  previous: StoredFsrsReview,
  now: DateInput = new Date(),
): number {
  return scheduler.get_retrievability(previous.card, instant(now), false);
}

export function forgettingRisk(
  previous: StoredFsrsReview,
  now: DateInput = new Date(),
): number {
  return 1 - retrievability(previous, now);
}

export function isFsrsDue(
  previous: StoredFsrsReview | undefined,
  now: DateInput = new Date(),
): boolean {
  const time = instant(now).getTime();
  return !previous || instant(previous.card.due).getTime() <= time;
}

/** New/unseen cards belong to the new-word queue and are deliberately excluded. */
export function rankDueReviews(
  records: Record<string, StoredFsrsReview>,
  now: DateInput = new Date(),
): [string, StoredFsrsReview][] {
  const date = instant(now);
  return Object.entries(records)
    .filter(
      ([, review]) =>
        review.card.state !== CardState.New && isFsrsDue(review, date),
    )
    .map(([id, review]) => ({ id, review, risk: forgettingRisk(review, date) }))
    .sort(
      (a, b) =>
        b.risk - a.risk ||
        Date.parse(a.review.card.due) - Date.parse(b.review.card.due) ||
        a.id.localeCompare(b.id),
    )
    .map(({ id, review }) => [id, review]);
}

export function formatReviewInterval(
  due: DateInput,
  now: DateInput = new Date(),
): string {
  const remaining = instant(due).getTime() - instant(now).getTime();
  if (remaining <= 0) return "现在";
  if (remaining < 3600000) return `${Math.ceil(remaining / 60000)} 分钟后`;
  if (remaining < 86400000) return `${Math.ceil(remaining / 3600000)} 小时后`;
  return `${Math.ceil(remaining / 86400000)} 天后`;
}

/**
 * SM-2 snapshots cannot reconstruct a review history. Use the current official
 * fsrs-rs memory_state_from_sm2 conversion at assumed retention 0.9, preserving
 * the original snapshot and due day. This is initialization, never scheduling.
 */
export function migrateSm2Review(legacy: WordReview): StoredFsrsReview {
  const assumedRetention = 0.9;
  const stability = clamp(legacy.interval, S_MIN, S_MAX);
  const difficulty = clamp(
    11 -
      (legacy.ease - 1) /
        (Math.exp(default_w[8]) *
          stability ** -default_w[9] *
          Math.expm1((1 - assumedRetention) * default_w[10])),
    1,
    10,
  );
  return fsrsReviewSchema.parse({
    algorithm: "fsrs-6",
    card: {
      ...serializeCard(createEmptyCard()),
      due: instant(`${legacy.due}T00:00:00+08:00`).toISOString(),
      last_review: instant(`${legacy.lastDate}T00:00:00+08:00`).toISOString(),
      stability,
      difficulty,
      scheduled_days: legacy.interval,
      reps: Math.max(1, legacy.repetitions),
      state: legacy.repetitions === 0 ? CardState.Relearning : CardState.Review,
    },
    history: [],
    legacy,
    migration:
      "estimated-from-sm2; assumed-retention=0.9; due-preserved; last-review=day-only; reps=lower-bound; lapses=unknown",
  });
}

function attemptRating(attempt: Attempt): ReviewRating | undefined {
  if (attempt.score === 0) return "again";
  if (attempt.score === 1) return "good";
  if (attempt.score === null && Object.hasOwn(ratings, attempt.answer))
    return attempt.answer as ReviewRating;
  return undefined;
}

/**
 * Replay the historical SM-2 arithmetic only to check that known events are
 * compatible with the preserved snapshot; this never schedules FSRS reviews.
 */
function historyMatchesSnapshot(
  events: Attempt[],
  legacy: WordReview,
): boolean {
  if (!events.length) return false;
  let ease = 2.5,
    interval = 1,
    repetitions = 0;
  for (const attempt of events) {
    const rating = attemptRating(attempt);
    if (!rating) return false;
    const quality = { again: 1, hard: 3, good: 4, easy: 5 }[rating];
    ease = clamp(
      ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
      1.3,
      4,
    );
    repetitions = quality < 3 ? 0 : repetitions + 1;
    interval =
      quality < 3
        ? 1
        : repetitions === 1
          ? 1
          : repetitions === 2
            ? 6
            : Math.max(1, Math.round(interval * ease));
  }
  const lastDate = events.at(-1)!.date;
  return (
    interval === legacy.interval &&
    repetitions === legacy.repetitions &&
    Math.abs(ease - legacy.ease) < 1e-9 &&
    lastDate === legacy.lastDate &&
    shiftDate(lastDate, interval) === legacy.due
  );
}

/** Add missing FSRS cards once, leaving all legacy records and attempts intact. */
export function migrateExistingReviews(state: State): State {
  const missing = Object.entries(state.reviews).filter(
    ([id]) => !Object.hasOwn(state.extension.fsrsReviews, id),
  );
  if (!missing.length) return state;
  const reviews = { ...state.extension.fsrsReviews };
  for (const [id, legacy] of missing) {
    const events = state.attempts
      .filter(
        (attempt) => attempt.skill === "foundation" && attempt.contentId === id,
      )
      .sort(
        (a, b) =>
          Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
          a.id.localeCompare(b.id),
      );
    if (historyMatchesSnapshot(events, legacy)) {
      let review: StoredFsrsReview | undefined;
      for (const attempt of events)
        review = reviewFsrs(review, attemptRating(attempt)!, attempt.createdAt);
      reviews[id] = fsrsReviewSchema.parse({
        ...review,
        legacy,
        migration:
          "replayed-snapshot-consistent-history; original-sm2-preserved; completeness=unverified",
      });
    } else {
      reviews[id] = migrateSm2Review(legacy);
    }
  }
  return { ...state, extension: { ...state.extension, fsrsReviews: reviews } };
}

function cleanText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function normalizeHeadword(value: string): string {
  return cleanText(value)
    .replace(/[\u2018\u2019]/gu, "'")
    .toLocaleLowerCase("en-US");
}

function uniqueText(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map(cleanText).filter((value) => {
    const key = value.toLocaleLowerCase("en-US");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A repeated selection enriches the existing word and retains its review ID. */
export function upsertPersonalWord(
  state: State,
  input: PersonalWordInput,
  now: DateInput = new Date(),
): State {
  const headword = normalizeHeadword(input.headword);
  if (!headword || headword.length > 120)
    throw new Error("生词或短语长度应为 1–120 个字符");
  const existing = Object.values(state.extension.userWords).find(
    (word) => normalizeHeadword(word.headword) === headword,
  );
  const builtIn = vocabularyEntries(state).find(
    (word) => normalizeHeadword(word.word) === headword,
  );
  const id =
    existing?.id ?? builtIn?.id ?? `personal:${encodeURIComponent(headword)}`;
  const contextKeys = new Set<string>();
  const contexts = [...(existing?.contexts ?? []), ...(input.contexts ?? [])]
    .map((context) => ({ ...context, text: cleanText(context.text) }))
    .filter((context) => {
      const key = `${context.source}\u0000${context.text.toLocaleLowerCase("en-US")}`;
      if (contextKeys.has(key)) return false;
      contextKeys.add(key);
      return true;
    });
  const word = userWordSchema.parse({
    id,
    headword,
    ipa: input.ipa?.trim() || existing?.ipa || builtIn?.ipa || "",
    definition:
      input.definition?.trim() ||
      existing?.definition ||
      builtIn?.definition ||
      "",
    meaning:
      input.meaning?.trim() || existing?.meaning || builtIn?.meaning || "",
    pos: input.pos?.trim() || existing?.pos || builtIn?.pos || "",
    examples: uniqueText([
      ...(existing?.examples ?? (builtIn ? [builtIn.example] : [])),
      ...(input.examples ?? []),
    ]),
    collocations: uniqueText([
      ...(existing?.collocations ?? builtIn?.collocations ?? []),
      ...(input.collocations ?? []),
    ]),
    synonyms: uniqueText([
      ...(existing?.synonyms ?? builtIn?.synonyms ?? []),
      ...(input.synonyms ?? []),
    ]),
    family: uniqueText([...(existing?.family ?? builtIn?.family ?? []), ...(input.family ?? [])]),
    cefr: input.cefr ?? existing?.cefr ?? null,
    sources: uniqueText([
      ...(existing?.sources ?? builtIn?.sources ?? []),
      ...(input.sources ?? []),
      "personal",
    ]),
    contexts,
    fieldSources: { ...builtIn?.fieldSources, ...existing?.fieldSources, ...input.fieldSources },
  });
  return {
    ...state,
    extension: {
      ...state.extension,
      userWords: { ...state.extension.userWords, [id]: word },
      fsrsReviews: {
        ...state.extension.fsrsReviews,
        [id]:
          state.extension.fsrsReviews[id] ??
          (state.reviews[id]
            ? migrateSm2Review(state.reviews[id])
            : createFsrsReview(now)),
      },
    },
  };
}
