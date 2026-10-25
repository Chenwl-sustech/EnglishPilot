"use client";
import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useStudy } from "./study-context";
import {
  analyticsSummary,
  trustedGap,
  saveTrustedAssessment,
  dateCompliance,
} from "@/lib/analytics";
import { fourSkills } from "@/lib/adaptive-model";
import { labels } from "@/lib/model";
import { chinaDate, shiftDate, classifyDate } from "@/lib/calendar";
import { budgetForState } from "@/lib/scheduler";
export function AnalyticsExtension() {
  const { state, update, notify, fail } = useStudy();
  const [exam, setExam] = useState<"ielts" | "toefl">(state.profile.primary),
    [date, setDate] = useState(chinaDate()),
    [source, setSource] = useState(""),
    [kind, setKind] = useState<"official" | "calibrated-mock">(
      "calibrated-mock",
    ),
    [scores, setScores] = useState({
      listening: "",
      reading: "",
      writing: "",
      speaking: "",
    });
  const summary = analyticsSummary(state),
    gap = trustedGap(state, exam);
  async function save() {
    try {
      if (Object.values(scores).some((v) => v === ""))
        throw new Error("请录入同一次完整测试的四项成绩");
      await update((s) =>
        saveTrustedAssessment(s, {
          exam,
          date,
          source,
          kind,
          scores: Object.fromEntries(
            Object.entries(scores).map(([k, v]) => [k, Number(v)]),
          ) as Record<(typeof fourSkills)[number], number>,
        }),
      );
      notify("测试成绩已保存，和练习正确率、AI 评价独立展示");
    } catch (e) {
      fail(e);
    }
  }
  const stats = [
    ["学习计划第", summary.day, "天"],
    ["距考试", summary.examDays, "天"],
    ["今日任务完成", Math.round(summary.todayCompletion * 100), "%"],
    ["今日学习", Math.floor(summary.todaySeconds / 60), "分钟"],
    ["本周学习", Math.floor(summary.weekSeconds / 60), "分钟"],
    ["计划合规连续", summary.complianceStreak, "天"],
    ["实际练习连续", summary.actualStreak, "天"],
    ["词汇掌握", summary.mastered, "张"],
    ["FSRS 今日待复习", summary.due, "张"],
    ["错题已解决", summary.resolved, `/ ${summary.mistakes} 条`],
  ];
  const dates = Array.from({ length: 365 }, (_, i) =>
    shiftDate(state.profile.startDate, i),
  );
  const ai = state.extension.evaluations.filter(
    (e) => e.exam === exam && !e.disputed,
  );
  return (
    <>
      <section className="panel analytics-extension">
        <h2>计划与复习状态</h2>
        <div className="analytics-metrics">
          {stats.map(([name, n, unit]) => (
            <article key={name}>
              <small>{name}</small>
              <strong>
                {n}
                <small>{unit}</small>
              </strong>
            </article>
          ))}
        </div>
        <p className="small muted">
          下次阶段小测：{summary.nextTest ?? "尚未安排"}。词汇掌握采用 FSRS
          复习态、至少 3 次复习及稳定性 ≥21
          天的启发式指标；计划休息日属于合规日。
        </p>
        <h3>365 天学习日历</h3>
        <div className="year-heatmap" aria-label="365 天学习热力图">
          {dates.map((d) => {
            const b =
                state.extension.budgets.find((b) => b.date === d) ??
                budgetForState(state, d),
              official = classifyDate(
                d,
                state.extension.calendarYears,
                state.extension.overrides,
              ),
              studied = state.attempts.some((a) => a.date === d),
              completed = dateCompliance(state, d),
              custom = state.extension.overrides[d]?.type === "rest";
            const status =
              d > chinaDate()
                ? "future"
                : b.rest
                  ? "rest"
                  : completed
                    ? "complete"
                    : studied
                      ? "partial"
                      : "missed";
            return (
              <a
                key={d}
                href={`/calendar?date=${d}`}
                className={`heat-${status} ${b.intensive ? "heat-intensive" : ""} ${official.holiday ? "heat-holiday" : ""} ${custom ? "heat-custom" : ""}`}
                title={`${d} · ${b.reason} · ${b.rest ? "计划休息" : completed ? "完成计划" : studied ? "部分完成" : d > chinaDate() ? "未来计划" : "未完成学习日"}`}
                aria-label={`${d} ${status}`}
              />
            );
          })}
        </div>
        <p className="small muted">
          绿色：完成 · 浅绿：部分完成 · 灰色：计划休息 · 浅红：未完成 ·
          外框：强化 · 底线：官方假期 ·
          点框：自定义休息。未来日期仅为预算预览，任务按当天表现生成。
        </p>
      </section>
      <section className="panel analytics-extension">
        <div className="section-line">
          <h2>考试能力与目标</h2>
          <label>
            趋势考试
            <select
              value={exam}
              onChange={(e) => setExam(e.target.value as "ielts" | "toefl")}
            >
              <option value="ielts">IELTS Band</option>
              <option value="toefl">TOEFL 2026 · 1–6</option>
            </select>
          </label>
        </div>
        {gap ? (
          <>
            <p>
              最近可信完整测试：{gap.date} · {gap.source} ·{" "}
              {gap.kind === "official" ? "实际考试" : "用户录入可信模考"}
            </p>
            <p>
              <strong>
                {exam === "ielts" ? "IELTS Overall" : "TOEFL 2026 总分"}{" "}
                {gap.overall} / 目标 {gap.target} · 差距{" "}
                {gap.overallGap.toFixed(1)}
              </strong>
              <br />
              <small>
                只依据这一次完整四项结果计算，不拼接不同测试的分项。
              </small>
            </p>
            <div className="feedback-dimensions">
              {fourSkills.map((k) => (
                <article key={k}>
                  <strong>
                    {labels[k]} {gap.skills[k].score} / 目标{" "}
                    {gap.skills[k].target}
                  </strong>
                  <p>差距 {gap.skills[k].gap.toFixed(1)}</p>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">
            暂无足够数据：需要同一次可信完整四项测试。单项练习与 AI
            评价不用于计算正式总分差距。
          </p>
        )}
        <h3>可信测试趋势（量表 {exam === "ielts" ? "0–9" : "1–6"}）</h3>
        {[...fourSkills, "overall" as const].map((k) => {
          const points = state.extension.scoreHistory
            .filter(
              (r) =>
                r.exam === exam &&
                r.skill === k &&
                r.kind !== "ai-estimate" &&
                r.max === (exam === "ielts" ? 9 : 6),
            )
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((p) => ({ ...p, [p.kind]: p.score }));
          return (
            <div key={k}>
              <h4>{k === "overall" ? "总分" : labels[k]}</h4>
              {points.length > 1 ? (
                <ResponsiveContainer width="100%" height={145} minWidth={0}>
                  <LineChart data={points}>
                    <XAxis dataKey="date" />
                    <YAxis domain={exam === "ielts" ? [0, 9] : [1, 6]} />
                    <Tooltip
                      content={({ active, payload }) => {
                        const p = payload?.[0]?.payload;
                        return active && p ? (
                          <div className="panel small">
                            {p.date} · {p.score}
                            <br />
                            样本 {p.sampleCount} · {p.source} · {p.kind}
                          </div>
                        ) : null;
                      }}
                    />
                    <Line
                      dataKey="official"
                      name="实际考试"
                      stroke="#498e83"
                      connectNulls={false}
                    />
                    <Line
                      dataKey="calibrated-mock"
                      name="可信模考"
                      stroke="#b58431"
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="small muted">
                  {points.length
                    ? `${points[0].date}：${points[0].score} · ${points[0].source}（样本 ${points[0].sampleCount}，仅一个点）`
                    : "暂无足够数据"}
                </p>
              )}
            </div>
          );
        })}
        <h3>AI 单次任务评价（独立记录）</h3>
        {ai.length ? (
          ai
            .slice(-8)
            .reverse()
            .map((e) => (
              <details className="version" key={e.id}>
                <summary>
                  {e.createdAt.slice(0, 10)} · {labels[e.skill]} · {e.taskType}{" "}
                  · 样本 1 · AI 模拟
                </summary>
                {e.dimensions.map((d) => (
                  <p key={d.name}>
                    {d.name}：
                    {d.score === null
                      ? "暂无法可靠评分"
                      : `${d.score}/${d.max}`}{" "}
                    · {d.evidence}
                  </p>
                ))}
              </details>
            ))
        ) : (
          <p className="small muted">
            暂无 AI 评价。没有可靠数据时不生成估分曲线。
          </p>
        )}
        <p className="small muted">
          TOEFL 新旧量表分别保存。旧版目标 {state.profile.toeflLegacy}/120
          仅作历史参考。
          {state.profile.toeflLegacy === 95 && (
            <>
              ETS 官方对照表将旧版 95+ 对应到新版 5.0
              档位，属于区间参考，不能从单次练习精确换算。
            </>
          )}
          <a
            href="https://www.ets.org/toefl/test-takers/ibt/scores/understand-scores.html"
            target="_blank"
            rel="noreferrer"
          >
            ETS 量表与总分规则
          </a>
        </p>
        <details>
          <summary>录入实际考试 / 可信完整模考</summary>
          <p className="small muted">
            请使用同一次测试的四项分数，说明来源。TOEFL 此处仅接受新版 1–6
            量表。
          </p>
          <div className="form-grid">
            <label>
              测试日期
              <input
                type="date"
                value={date}
                max={chinaDate()}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              来源说明
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                maxLength={500}
              />
            </label>
            <label>
              数据性质
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                <option value="calibrated-mock">可信完整模考</option>
                <option value="official">实际考试成绩</option>
              </select>
            </label>
            {fourSkills.map((k) => (
              <label key={k}>
                {labels[k]}测试分数
                <input
                  type="number"
                  min={exam === "ielts" ? 0 : 1}
                  max={exam === "ielts" ? 9 : 6}
                  step="0.5"
                  value={scores[k]}
                  onChange={(e) =>
                    setScores({ ...scores, [k]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
          <button className="button primary" onClick={() => void save()}>
            保存同次四项成绩
          </button>
        </details>
      </section>
    </>
  );
}
