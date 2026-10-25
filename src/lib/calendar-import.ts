import { holidayYearSchema, chinaDate, shiftDate } from "./calendar";
import type { State } from "./model";
export function importVerifiedCalendar(s: State, input: unknown): State {
  const row = holidayYearSchema.parse(input);
  if (!row.verified) throw new Error("仅导入已核实的官方年度安排");
  if (row.publishedAt > chinaDate()) throw new Error("通知发布日期不能在未来");
  if (!row.lunarEve || !row.lunarNewYear)
    throw new Error("请同时核实除夕及正月初一日期");
  const days = new Set<string>();
  for (const p of row.periods) {
    if (
      p.start > p.end ||
      p.start.slice(0, 4) !== String(row.year) ||
      p.end.slice(0, 4) !== String(row.year)
    )
      throw new Error("假期区间必须在对应年度内且起止正确");
    for (let d = p.start; d <= p.end; d = shiftDate(d, 1)) {
      if (days.has(d)) throw new Error("假期区间不可重叠");
      days.add(d);
    }
  }
  if (row.makeup.some((d) => days.has(d) || d.slice(0, 4) !== String(row.year)))
    throw new Error("补班日不能与官方假期重叠或跨年度");
  if (row.statutory.some((d) => !days.has(d)))
    throw new Error("法定节日应包含在已核实假期范围内");
  const old = s.extension.calendarYears.find(
    (c) => c.year === row.year && c.version === row.version,
  );
  if (old) {
    if (JSON.stringify(old) !== JSON.stringify(row))
      throw new Error("同一版本已有不同数据，请使用新的版本号");
    return s;
  }
  return {
    ...s,
    extension: {
      ...s.extension,
      calendarYears: [...s.extension.calendarYears, row],
      lastScheduleDate: null,
    },
  };
}
