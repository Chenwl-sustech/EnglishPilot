"use client";
import { useState } from "react";
import { fourSkills, ratiosSchema } from "@/lib/adaptive-model";
import { labels } from "@/lib/model";
import { shiftDate } from "@/lib/calendar";
import { useStudy } from "./study-context";
export function AdaptivePlan() {
  const { state, update, notify, fail } = useStudy();
  const [ratios, setRatios] = useState({ ...state.extension.ratios }),
    [config, setConfig] = useState({ ...state.extension.plannerConfig });
  async function save() {
    try {
      const parsed = ratiosSchema.parse(ratios);
      if (Object.values(parsed).some((n) => n < config.min || n > config.max))
        throw new Error("每项比例应在配置的上下限内");
      await update((s) => ({
        ...s,
        extension: {
          ...s.extension,
          ratios: parsed,
          plannerConfig: config,
          allocationMode: "manual",
          lastScheduleDate: null,
        },
      }));
      notify("四项比例已保存；基础与复习先预留，专项训练按新比例安排");
    } catch (e) {
      fail(e);
    }
  }
  return (
    <section className="panel adaptive-plan">
      <div className="section-line">
        <h2>每周自适应 · 四项专项时间</h2>
        <span className="tag">
          下次评估 {shiftDate(state.extension.lastAllocationDate, 7)}
        </span>
      </div>
      <p className="muted">
        先为词汇、语法及到期 FSRS 预留时间，剩余时间在四项间分配。初始保留 21 /
        26 / 26 / 21 / 26 分钟基础计划；达到样本要求后每周微调。AI
        文本评价与客观正确率分别处理，不视为真实考试成绩。
      </p>
      <div className="form-grid">
        {fourSkills.map((k) => (
          <label key={k}>
            {labels[k]}比例（%）
            <input
              type="number"
              value={ratios[k]}
              min={config.min}
              max={config.max}
              onChange={(e) =>
                setRatios({ ...ratios, [k]: e.target.valueAsNumber })
              }
            />
          </label>
        ))}
        {(
          [
            ["min", "单项最低比例", 5, 25],
            ["max", "单项最高比例", 25, 70],
            ["weeklyChange", "每周最大变化（百分点）", 1, 20],
            ["sampleMinimum", "单项最少练习样本", 3, 30],
            ["windowDays", "观察窗口（天）", 14, 28],
          ] as const
        ).map(([key, name, min, max]) => (
          <label key={key}>
            {name}
            <input
              type="number"
              value={config[key]}
              min={min}
              max={max}
              onChange={(e) =>
                setConfig({ ...config, [key]: e.target.valueAsNumber })
              }
            />
          </label>
        ))}
      </div>
      <p className="small">
        合计 {Object.values(ratios).reduce((n, v) => n + v, 0)}% · 自动调整{" "}
        {state.settings.adaptive ? "开启" : "关闭（可在设置修改）"} · 当前模式{" "}
        {state.extension.allocationMode === "base"
          ? "保留基础分钟配额"
          : state.extension.allocationMode === "manual"
            ? "用户指定四项比例"
            : "自适应比例"}
      </p>
      <button className="button primary" onClick={() => void save()}>
        保存四项比例与约束
      </button>
      <h3>每周调整原因</h3>
      {state.extension.allocations.length ? (
        state.extension.allocations
          .slice(-8)
          .reverse()
          .map((w) => (
            <article className="weekly-record" key={w.id}>
              <strong>
                {w.date} · 观察 {w.from} 起
              </strong>
              <p>{w.reason}</p>
              <p className="small">
                {fourSkills
                  .map(
                    (k) =>
                      `${labels[k]} ${w.before[k]}→${w.after[k]}%（${w.samples[k] ?? 0} 次）`,
                  )
                  .join(" · ")}
              </p>
            </article>
          ))
      ) : (
        <p className="muted">
          满一周后根据过去 2–4
          周真实记录评估。样本不足保持分配，明显疲劳时建议降低强度。
        </p>
      )}
    </section>
  );
}
