"use client";
import { apiFetch } from "@/lib/native/api";

import { useEffect, useState } from "react";
import { CalendarDays, RefreshCw, Save } from "lucide-react";
import { useStudy } from "./study-context";
import { PageHeading } from "./exercises";
import { budgetForState, ensureAdaptiveDay } from "@/lib/scheduler";
import { importVerifiedCalendar } from "@/lib/calendar-import";
import {
  calendarDays,
  calendarRulesSchema,
  chinaDate,
  classifyDate,
  dateOverrideSchema,
  dayLabels,
  shiftDate,
} from "@/lib/calendar";
export function CalendarPage() {
  const { state, update, notify, fail } = useStudy();
  const [month, setMonth] = useState(chinaDate().slice(0, 7)),
    [selected, setSelected] = useState(chinaDate()),
    [rules, setRules] = useState(state.extension.calendarRules),
    [type, setType] = useState<"auto" | "rest" | "intensive" | "workday">(
      "auto",
    ),
    [cap, setCap] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  const e = state.extension;
  const savedOverride = e.overrides[selected];
  const savedType = savedOverride?.type ?? "auto";
  const savedCap = savedOverride?.cap == null ? "" : String(savedOverride.cap);
  const savedNote = savedOverride?.note ?? "";
  useEffect(() => {
    const date = new URLSearchParams(window.location.search).get("date");
    if (
      date &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      Number.isFinite(Date.parse(date))
    ) {
      setMonth(date.slice(0, 7));
      setSelected(date);
    }
  }, []);
  useEffect(() => {
    setType(savedType);
    setCap(savedCap);
    setNote(savedNote);
  }, [savedType, savedCap, savedNote, selected]);
  const start = `${month}-01`;
  const n = new Date(`${start}T12:00:00Z`);
  n.setUTCMonth(n.getUTCMonth() + 1);
  n.setUTCDate(0);
  const days = Array.from({ length: n.getUTCDate() }, (_, i) =>
    shiftDate(start, i),
  );
  const offset = (new Date(`${start}T12:00:00Z`).getUTCDay() + 6) % 7;
  const selectedDay = classifyDate(selected, e.calendarYears, e.overrides),
    selectedBudget = budgetForState(state, selected);
  async function saveRules(event: React.FormEvent) {
    event.preventDefault();
    try {
      const next = calendarRulesSchema.parse(rules);
      await update((s) =>
        ensureAdaptiveDay(
          { ...s, extension: { ...s.extension, calendarRules: next } },
          chinaDate(),
          true,
        ),
      );
      notify("日历学习规则已保存，今日任务已重新计算");
    } catch (x) {
      fail(x);
    }
  }
  async function saveOverride(event: React.FormEvent) {
    event.preventDefault();
    try {
      const value = dateOverrideSchema.parse({
        type,
        cap: cap === "" ? null : Number(cap),
        note,
      });
      await update((s) =>
        ensureAdaptiveDay(
          {
            ...s,
            extension: {
              ...s.extension,
              overrides: { ...s.extension.overrides, [selected]: value },
            },
          },
          chinaDate(),
          true,
        ),
      );
      notify("个人日期安排已保存");
    } catch (x) {
      fail(x);
    }
  }
  function select(date: string) {
    setSelected(date);
    const o = e.overrides[date];
    setType(o?.type ?? "auto");
    setCap(o?.cap == null ? "" : String(o.cap));
    setNote(o?.note ?? "");
  }
  async function check() {
    setBusy(true);
    try {
      const year = Number(month.slice(0, 4));
      const response = await apiFetch(`/api/calendar/check?year=${year}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "官方日历检查失败");
      await update((s) => ({
        ...s,
        extension: {
          ...s.extension,
          calendarChecks: [
            ...s.extension.calendarChecks.filter((c) => c.year !== year),
            result,
          ],
        },
      }));
      notify(result.message);
    } catch (x) {
      fail(x);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="CHINA HOLIDAY CALENDAR · ASIA/SHANGHAI"
        title="把学习，放进真实的生活。"
        description="官方假期、调休补班与个人安排共同决定每日预算。普通周六 0.5×B，周日 2×B，所有自动任务不超过 2B。"
      />
      <div className="calendar-layout">
        <section className="panel">
          <div className="section-line">
            <label>
              查看月份
              <input
                type="month"
                value={month}
                onChange={(v) => setMonth(v.target.value)}
              />
            </label>
            <button
              className="button secondary compact"
              onClick={() => void check()}
              disabled={busy}
            >
              <RefreshCw size={14} />
              检查年度官方安排
            </button>
          </div>
          <div className="calendar-grid">
            {["一", "二", "三", "四", "五", "六", "日"].map((x) => (
              <div className="calendar-weekday" key={x}>
                周{x}
              </div>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {days.map((date) => {
              const d = classifyDate(date, e.calendarYears, e.overrides),
                b = budgetForState(state, date);
              const tasks = e.tasks.filter(
                (t) =>
                  t.scheduledDate === date &&
                  !["cancelled", "deferred"].includes(t.status),
              );
              const done =
                tasks.length > 0 &&
                tasks
                  .filter((t) => !t.optional)
                  .every((t) => t.status === "done");
              const actual = state.attempts.some((a) => a.date === date);
              const historical = date < chinaDate();
              const missing = historical && !b.rest && !actual;
              return (
                <button
                  key={date}
                  className={`calendar-day ${selected === date ? "selected" : ""} ${b.rest ? "rest" : ""} ${b.intensive ? "intensive" : ""} ${done ? "complete" : ""} ${missing ? "missed" : ""}`}
                  onClick={() => select(date)}
                  aria-label={`${date} ${d.reason} ${b.limit}分钟`}
                >
                  <strong>{Number(date.slice(-2))}</strong>
                  <small>{b.rest ? "休息" : `${b.limit} min`}</small>
                  <span>{d.type === "workday" ? "" : dayLabels[d.type]}</span>
                  <i>
                    {done
                      ? "✓ 完成"
                      : missing
                        ? "未完成"
                        : actual
                          ? "有练习"
                          : ""}
                  </i>
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            <span>○ 计划休息</span>
            <span>● 强化学习</span>
            <span>✓ 完成计划</span>
            <span>◌ 未完成学习日</span>
          </div>
          <p className="small muted">
            {e.calendarYears.some((c) => c.year === Number(month.slice(0, 4)))
              ? "此年度已存官方安排。"
              : "节假日尚未核实：仅使用普通星期规则，不推断调休。"}{" "}
            官方假期中的休息不视为失败。
          </p>
          {e.calendarChecks
            .filter((c) => c.year === Number(month.slice(0, 4)))
            .map((c) => (
              <p key={c.year} className="small muted">
                最近检查 {c.checkedAt.slice(0, 10)}：{c.message}
              </p>
            ))}
        </section>
        <aside className="panel">
          <CalendarDays size={25} />
          <h2>{selected}</h2>
          <p>{selectedDay.reason}</p>
          <p className="muted">
            计划预算 {selectedBudget.limit} 分钟 · 硬上限{" "}
            {selectedBudget.hardLimit} 分钟
            {selectedDay.statutory ? " · 法定节日" : ""}
          </p>
          <form onSubmit={(v) => void saveOverride(v)}>
            <label>
              个人日期类型
              <select
                value={type}
                onChange={(v) => setType(v.target.value as typeof type)}
              >
                <option value="auto">按官方与星期规则</option>
                <option value="rest">个人休息日</option>
                <option value="intensive">个人强化学习日</option>
                <option value="workday">个人普通学习日</option>
              </select>
            </label>
            <label>
              个人时间上限（分钟，可留空）
              <input
                type="number"
                min="0"
                max="1440"
                value={cap}
                onChange={(v) => setCap(v.target.value)}
              />
            </label>
            <label>
              安排备注
              <input
                value={note}
                maxLength={500}
                onChange={(v) => setNote(v.target.value)}
              />
            </label>
            <button className="button primary full" type="submit">
              <Save size={15} />
              保存这个日期
            </button>
          </form>
          <p className="small muted">
            强化日仍受 2B 与个人上限约束。休息日不安排新课，轻量复习完全可选。
          </p>
        </aside>
      </div>
      <form
        className="panel calendar-rules"
        onSubmit={(v) => void saveRules(v)}
      >
        <div className="section-line">
          <h2>我的日历学习规则</h2>
          <span className="tag">B = {state.settings.dailyMinutes} 分钟</span>
        </div>
        <div className="form-grid three">
          {(
            [
              "saturdayMultiplier",
              "sundayMultiplier",
              "holidayMultiplier",
            ] as const
          ).map((key, i) => (
            <label key={key}>
              {["普通周六倍率", "普通周日倍率", "普通假期倍率"][i]}
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={rules[key]}
                onChange={(v) =>
                  setRules({ ...rules, [key]: v.target.valueAsNumber })
                }
              />
            </label>
          ))}
          <label>
            休息日可选复习（分钟）
            <input
              type="number"
              min="0"
              max="20"
              value={rules.restReviewMinutes}
              onChange={(v) =>
                setRules({
                  ...rules,
                  restReviewMinutes: v.target.valueAsNumber,
                })
              }
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={rules.enabled}
              onChange={(v) =>
                setRules({ ...rules, enabled: v.target.checked })
              }
            />
            启用节假日自动调整
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={rules.weekendTest}
              onChange={(v) =>
                setRules({ ...rules, weekendTest: v.target.checked })
              }
            />
            自动安排周末小测（计入预算）
          </label>
        </div>
        <button className="button primary" type="submit">
          保存日历规则
        </button>
        <p className="small muted">
          较长假期每隔若干天降为普通强度，避免连续每天强化；基础 B
          在设置页修改。每周学习天数变更仍按原规则从次日生效。
        </p>
      </form>
      <section className="panel calendar-sources">
        <h2>已核实的官方日历与来源</h2>
        <details>
          <summary>导入人工核实后的官方年度日历</summary>
          <p className="small muted">
            自动检索只提示候选通知，不猜测调休。按官方通知整理并核实 JSON
            后可导入；保留旧版本。格式见 docs/calendar-format.json。
          </p>
          <input
            aria-label="导入已核实年度日历"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void (async () => {
                try {
                  if (file.size > 100000)
                    throw new Error("年度日历应小于 100 KB");
                  const raw = JSON.parse(await file.text());
                  if (
                    !window.confirm(
                      `已核对国务院办公厅 ${raw.year} 年通知中的放假、补班、除夕与初一日期？来源：${raw.source}。导入版本：${raw.version}`,
                    )
                  )
                    return;
                  await update((s) => importVerifiedCalendar(s, raw));
                  notify("官方日历新版本已存储，旧版本保留");
                } catch (error) {
                  fail(error);
                }
              })();
            }}
          />
        </details>
        {e.calendarYears.map((c) => (
          <div key={c.version}>
            <h3>
              {c.year} · {c.version}
            </h3>
            <p className="small muted">
              发布 {c.publishedAt} · 本地更新 {c.updatedAt.slice(0, 10)} ·{" "}
              {c.periods.length} 段假期、{c.makeup.length} 个补班日
            </p>
            <a
              className="text-link"
              href={c.source}
              target="_blank"
              rel="noreferrer"
            >
              国务院办公厅年度放假通知 ↗
            </a>
          </div>
        ))}
        <p className="small muted">
          法定节日与调休假期区分参考国务院令第 795
          号。学习日期按上海时区解释。距离考试{" "}
          {Math.max(0, calendarDays(chinaDate(), state.profile.examDate))} 天。
        </p>
      </section>
    </>
  );
}
