import { z } from "zod";

export const holidayYearSchema = z.object({
  year: z.number().int().min(2000).max(2200),
  version: z.string().min(1),
  source: z
    .url()
    .refine(
      (u) => new URL(u).hostname === "www.gov.cn",
      "必须使用中国政府网官方来源",
    ),
  publishedAt: z.iso.date(),
  updatedAt: z.iso.datetime(),
  verified: z.boolean(),
  periods: z.array(
    z.object({ name: z.string(), start: z.iso.date(), end: z.iso.date() }),
  ),
  makeup: z.array(z.iso.date()),
  statutory: z.array(z.iso.date()),
  lunarEve: z.iso.date().optional(),
  lunarNewYear: z.iso.date().optional(),
});
export type HolidayYear = z.infer<typeof holidayYearSchema>;
export const calendarRulesSchema = z.object({
  enabled: z.boolean(),
  saturdayMultiplier: z.number().min(0).max(2),
  sundayMultiplier: z.number().min(0).max(2),
  holidayMultiplier: z.number().min(0).max(2),
  restReviewMinutes: z.number().int().min(0).max(20),
  weekendTest: z.boolean(),
  localVoicesOnly: z.boolean(),
});
export type CalendarRules = z.infer<typeof calendarRulesSchema>;
export const defaultCalendarRules: CalendarRules = {
  enabled: true,
  saturdayMultiplier: 0.5,
  sundayMultiplier: 2,
  holidayMultiplier: 1.5,
  restReviewMinutes: 0,
  weekendTest: true,
  localVoicesOnly: true,
};
export const dateOverrideSchema = z.object({
  type: z.enum(["auto", "rest", "intensive", "workday"]),
  cap: z.number().int().min(0).max(1440).nullable(),
  note: z.string().max(500),
});
export type DateOverride = z.infer<typeof dateOverrideSchema>;
export const official2026: HolidayYear = {
  year: 2026,
  version: "gov-2025-7/2026-v1",
  source: "https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm",
  publishedAt: "2025-11-04",
  updatedAt: "2026-10-15T12:00:00.000Z",
  verified: true,
  periods: [
    { name: "元旦", start: "2026-01-01", end: "2026-01-03" },
    { name: "春节", start: "2026-02-15", end: "2026-02-23" },
    { name: "清明节", start: "2026-04-04", end: "2026-04-06" },
    { name: "劳动节", start: "2026-05-01", end: "2026-05-05" },
    { name: "端午节", start: "2026-06-19", end: "2026-06-21" },
    { name: "中秋节", start: "2026-09-25", end: "2026-09-27" },
    { name: "国庆节", start: "2026-10-01", end: "2026-10-07" },
  ],
  makeup: [
    "2026-01-04",
    "2026-02-14",
    "2026-02-28",
    "2026-05-09",
    "2026-09-20",
    "2026-10-10",
  ],
  statutory: [
    "2026-01-01",
    "2026-02-16",
    "2026-02-17",
    "2026-02-18",
    "2026-02-19",
    "2026-04-05",
    "2026-05-01",
    "2026-05-02",
    "2026-06-19",
    "2026-09-25",
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
  ],
  lunarEve: "2026-02-16",
  lunarNewYear: "2026-02-17",
};
export function chinaDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)!.value)
    .join("-");
}
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function calendarDays(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
  );
}
export type DayType =
  | "custom-rest"
  | "custom-intensive"
  | "custom-workday"
  | "lunar-eve"
  | "lunar-new-year"
  | "holiday-first"
  | "makeup"
  | "holiday"
  | "saturday"
  | "sunday"
  | "workday";
export const dayLabels: Record<DayType, string> = {
  "custom-rest": "个人休息日",
  "custom-intensive": "个人强化日",
  "custom-workday": "个人普通学习日",
  "lunar-eve": "除夕",
  "lunar-new-year": "正月初一",
  "holiday-first": "连续假期第一天",
  makeup: "官方调休补班日",
  holiday: "官方假期",
  saturday: "普通周六",
  sunday: "普通周日",
  workday: "普通工作日",
};
export function classifyDate(
  date: string,
  calendars: HolidayYear[] = [official2026],
  overrides: Record<string, DateOverride> = {},
) {
  z.iso.date().parse(date);
  const year = calendars
    .filter((c) => c.year === Number(date.slice(0, 4)) && c.verified)
    .at(-1);
  const holiday = year?.periods.find((p) => date >= p.start && date <= p.end);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  let type: DayType =
    weekday === 6 ? "saturday" : weekday === 0 ? "sunday" : "workday";
  if (holiday) type = date === holiday.start ? "holiday-first" : "holiday";
  if (year?.makeup.includes(date)) type = "makeup";
  if (holiday && date === holiday.start) type = "holiday-first";
  if (date === year?.lunarNewYear) type = "lunar-new-year";
  if (date === year?.lunarEve) type = "lunar-eve";
  const manual = overrides[date];
  if (manual?.type === "rest") type = "custom-rest";
  // Explicit intensification is allowed on a holiday, while personal rest remains absolute.
  else if (manual?.type === "intensive") type = "custom-intensive";
  else if (manual?.type === "workday") type = "custom-workday";
  return {
    date,
    type,
    weekday,
    verified: !!year,
    statutory: !!year?.statutory.includes(date),
    holiday,
    source: year?.source,
    reason: `${dayLabels[type]}${year ? "" : " · 节假日尚未核实，暂按星期规则"}`,
  };
}
export type DailyTimeBudget = {
  date: string;
  base: number;
  limit: number;
  hardLimit: number;
  optionalReview: number;
  rest: boolean;
  intensive: boolean;
  multiplier: number;
  reason: string;
  calendarVersion: string | null;
};
export function timeBudget(
  date: string,
  base: number,
  rules: CalendarRules = defaultCalendarRules,
  calendars: HolidayYear[] = [official2026],
  overrides: Record<string, DateOverride> = {},
): DailyTimeBudget {
  if (!Number.isFinite(base) || base < 1) throw new Error("基础时长无效");
  const day = classifyDate(date, calendars, overrides),
    manual = overrides[date];
  const specialRest = [
    "custom-rest",
    "lunar-eve",
    "lunar-new-year",
    "holiday-first",
  ].includes(day.type);
  const rest = day.type === "custom-rest" || (rules.enabled && specialRest);
  let multiplier = 1;
  if (rules.enabled) {
    if (day.type === "saturday") multiplier = rules.saturdayMultiplier;
    else if (day.type === "sunday") multiplier = rules.sundayMultiplier;
    else if (day.type === "holiday") {
      const offset = day.holiday ? calendarDays(day.holiday.start, date) : 0;
      multiplier = offset > 1 && offset % 3 === 0 ? 1 : rules.holidayMultiplier;
    }
  }
  if (day.type === "custom-intensive") multiplier = 2;
  if (day.type === "custom-workday") multiplier = 1;
  const hardLimit = Math.floor(2 * base),
    cap = manual?.cap ?? hardLimit;
  const limit = Math.max(
    0,
    Math.min(
      hardLimit,
      cap,
      rest ? rules.restReviewMinutes : Math.round(base * multiplier),
    ),
  );
  return {
    date,
    base,
    hardLimit,
    limit,
    optionalReview: rest ? limit : 0,
    rest: rest || limit === 0,
    intensive: !rest && limit > base,
    multiplier: rest ? 0 : multiplier,
    reason: day.reason,
    calendarVersion:
      calendars.filter((c) => c.year === Number(date.slice(0, 4)) && c.verified).at(-1)
        ?.version ?? null,
  };
}
