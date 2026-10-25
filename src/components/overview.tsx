"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Headphones,
  Mic,
  PenLine,
  Layers3,
  Check,
  ChevronRight,
  Flame,
  Clock3,
  Sparkles,
  CalendarDays,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useStudy } from "./study-context";
import { addDays, daysBetween, phaseForDay, today } from "@/lib/engine";
import { labels, skills, type Skill } from "@/lib/model";
import { PageHeading } from "./exercises";
import { DynamicTaskList } from "./daily-tasks";
import { AnalyticsExtension } from "./analytics-extension";
import { AdaptivePlan } from "./adaptive-plan";
import { MistakeBook } from "./mistake-book";
import { taskAction, taskUrl } from "@/lib/scheduler";

export const skillRoutes: Record<Skill, string> = {
  foundation: "/vocabulary",
  listening: "/listening",
  reading: "/reading",
  speaking: "/speaking",
  writing: "/writing",
};
export const skillIcons = {
  foundation: Layers3,
  listening: Headphones,
  reading: BookOpen,
  speaking: Mic,
  writing: PenLine,
};
const taskCopy: Record<Skill, [string, string]> = {
  foundation: ["Build your foundation", "新词、到期复习与基础语法"],
  listening: ["Tune in to English", "听懂细节，抓住主旨"],
  reading: ["Read with curiosity", "从日常英文走向学术阅读"],
  speaking: ["Find your voice", "围绕一个话题，练习清晰表达"],
  writing: ["Make your ideas clear", "写一个段落，再认真修改一次"],
};
export const phases = [
  {
    days: "DAY 001 — 090",
    title: "打好语言基础",
    description: "高频词汇、基础语法、简单听读与表达。",
  },
  {
    days: "DAY 091 — 180",
    title: "建立独立表达",
    description: "学术英语基础、精听、长句与段落写作。",
  },
  {
    days: "DAY 181 — 270",
    title: "走进考试专项",
    description: "分题型强化、限时训练与阶段测评。",
  },
  {
    days: "DAY 271 — 365",
    title: "朝目标稳步冲刺",
    description: "综合运用、针对薄弱项复习与考前训练。",
  },
];
function streak(dates: Set<string>) {
  let n = 0,
    day = dates.has(today()) ? today() : addDays(today(), -1);
  while (dates.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}
export function Today() {
  const { state, update, fail } = useStudy();
  const tasks = state.tasks.filter((t) => t.date === today());
  const done = tasks.filter((t) => t.status === "done").length;
  const available = state.extension.tasks.filter(
    (t) =>
      t.scheduledDate === today() &&
      ["pending", "paused", "running"].includes(t.status),
  );
  const next =
    available.find((t) => t.status === "running") ??
    available.find((t) => t.id === state.extension.selectedTaskId) ??
    available.find(
      (t) => t.skill === tasks.find((t) => t.status === "pending")?.skill,
    ) ??
    available[0];
  const day = Math.max(1, daysBetween(state.profile.startDate, today()) + 1);
  const minutes = tasks.reduce((n, t) => n + t.minutes, 0);
  const active = phaseForDay(day);
  const last = state.extension.allocations.at(-1);
  const reviewDate = addDays(state.extension.lastAllocationDate, 7);
  const actual = state.attempts
    .filter((a) => a.date === today())
    .reduce((n, a) => n + a.seconds, 0);
  return (
    <>
      <div className="today-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="tiny-line" /> A LITTLE BETTER, EVERY DAY
          </div>
          <h1>
            把今天，变成
            <br />
            进步的一天。
          </h1>
          <p>
            {state.profile.name}，欢迎回来。保持自己的节奏，
            <br className="desktop-break" />
            让听、说、读、写一起向前。
          </p>
          <div className="hero-meta">
            <span>
              <CalendarDays size={15} />第 {day} 天 / 365 天
            </span>
            <i />
            <span>{phases[active].title}</span>
          </div>
          <Link
            href={next ? taskUrl(next) : "/dashboard"}
            onClick={() => {
              if (next)
                void update((s) => taskAction(s, next.id, "start")).catch(fail);
            }}
            className="button primary"
          >
            {next
              ? "继续今日学习"
              : tasks.length && done === tasks.length
                ? "查看今日成果"
                : "查看学习总览"}{" "}
            <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="orbit-star star-one">✦</div>
          <div className="orbit-star star-two">✧</div>
          <div className="orbit-label label-one">ONE STEP</div>
          <div className="orbit-label label-two">AT A TIME</div>
          <div className="pilot-compass">
            <svg viewBox="0 0 180 180">
              <circle
                cx="90"
                cy="90"
                r="77"
                fill="none"
                stroke="currentColor"
                strokeWidth=".7"
              />
              <path d="m53 111 74-66-38 91-9-34z" fill="currentColor" />
              <path d="m80 102 47-57" stroke="#f0f5ed" strokeWidth="2" />
              <path
                d="M90 5v12M90 163v12M5 90h12M163 90h12"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
          </div>
          <div className="art-caption">YOUR NEXT CHAPTER</div>
        </div>
      </div>
      <div className="daily-stats">
        <div>
          <span>今日计划</span>
          <strong data-testid="daily-budget">
            {minutes}
            <small>分钟</small>
          </strong>
        </div>
        <div>
          <span>任务完成</span>
          <strong>
            {done}
            <small>/ {tasks.length}</small>
          </strong>
        </div>
        <div>
          <span>真实练习</span>
          <strong>
            {Math.floor(actual / 60)}
            <small>分钟 {actual % 60} 秒</small>
          </strong>
        </div>
        <div>
          <span>下次周评估</span>
          <strong className="date-value">
            {state.settings.adaptive
              ? reviewDate.slice(5).replace("-", " / ")
              : "已关闭"}
            <small>
              {state.settings.adaptive ? "打开时自动评估" : "可在设置开启"}
            </small>
          </strong>
        </div>
      </div>
      <DynamicTaskList />
      <div className="today-columns">
        <section>
          <div className="section-line">
            <h2>
              按能力汇总 <span className="count">{tasks.length}</span>
            </h2>
            <Link href="/plan" className="text-link">
              查看学习计划 <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="task-list">
            {tasks.length ? (
              tasks.map((t, i) => {
                const Icon = skillIcons[t.skill];
                return (
                  <article
                    className={`panel task-card ${t.status === "done" ? "completed" : ""}`}
                    key={t.id}
                    data-testid={`task-${t.skill}`}
                  >
                    <div className={`task-icon ${t.skill}`}>
                      <Icon size={23} />
                    </div>
                    <div className="task-copy">
                      <div className="task-heading">
                        <h3>{labels[t.skill]}</h3>
                        <span>{t.minutes} 分钟</span>
                      </div>
                      <p>{taskCopy[t.skill][1]}</p>
                      <div className="task-sub">
                        <small>
                          {String(i + 1).padStart(2, "0")} ·{" "}
                          {taskCopy[t.skill][0]}
                        </small>
                        {t.status === "done" ? (
                          <span className="done-label">
                            <Check size={13} />
                            已完成练习
                          </span>
                        ) : (
                          <span className="small muted">
                            任务操作见上方清单
                          </span>
                        )}
                      </div>
                    </div>
                    <Link
                      aria-label={`开始${labels[t.skill]}`}
                      className="task-arrow"
                      href={
                        state.extension.tasks.find(
                          (x) =>
                            x.scheduledDate === today() &&
                            x.skill === t.skill &&
                            ![
                              "done",
                              "skipped",
                              "deferred",
                              "cancelled",
                            ].includes(x.status),
                        )
                          ? taskUrl(
                              state.extension.tasks.find(
                                (x) =>
                                  x.scheduledDate === today() &&
                                  x.skill === t.skill &&
                                  ![
                                    "done",
                                    "skipped",
                                    "deferred",
                                    "cancelled",
                                  ].includes(x.status),
                              )!,
                            )
                          : skillRoutes[t.skill]
                      }
                    >
                      <ArrowUpRight size={21} />
                    </Link>
                  </article>
                );
              })
            ) : (
              <div className="panel empty">
                <CalendarDays size={30} />
                <h3>今天是你的休息日</h3>
                <p>可以自由复习；休息不会增加任务积压。</p>
              </div>
            )}
          </div>
        </section>
        <aside className="today-aside">
          <div className="panel weekly-note">
            <div className="section-line">
              <span className="eyebrow">A PLAN THAT GROWS WITH YOU</span>
              <Sparkles size={18} />
            </div>
            <h2>
              均衡打底，
              <br />
              逐周找到更好的节奏。
            </h2>
            <p>
              {last
                ? last.reason
                : "这周先从均衡计划开始。累积真实练习后，再为薄弱项目安排更多时间。"}
            </p>
            <div className="mini-allocation">
              {skills.map((k) => (
                <div key={k}>
                  <span>
                    <i className={`dot ${k}`} />
                    {labels[k]}
                  </span>
                  <strong>
                    {state.settings.effective[k]}
                    <small>min</small>
                  </strong>
                </div>
              ))}
            </div>
            <Link href="/settings" className="text-link">
              调整我的配额 <ArrowRight size={15} />
            </Link>
          </div>
          <div className="reflection-note">
            <div>
              <span className="eyebrow">WEEKLY REFLECTION</span>
              <BookOpen size={20} />
            </div>
            <h3>每周，给进步留一点回声。</h3>
            <p>回看错题，写下一个收获，再选一个下周想解决的问题。</p>
            <Link className="text-link" href="/mistakes">
              打开错题与复习 <ChevronRight size={14} />
            </Link>
          </div>
          <p className="local-caption">
            <span className="live-dot" /> 所有进步，都从真实记录开始。
          </p>
        </aside>
      </div>
    </>
  );
}
export function Dashboard() {
  const { state } = useStudy();
  const total = state.attempts.reduce((n, a) => n + a.seconds, 0);
  const recent = state.attempts.filter(
    (a) => a.date >= addDays(today(), -6) && a.date <= today(),
  );
  const dates = new Set(state.attempts.map((a) => a.date));
  const data = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today(), i - 6);
    return {
      date: date.slice(5),
      分钟: Number(
        (
          state.attempts
            .filter((a) => a.date === date)
            .reduce((n, a) => n + a.seconds, 0) / 60
        ).toFixed(1),
      ),
    };
  });
  return (
    <>
      <PageHeading
        eyebrow="DASHBOARD · YOUR PROGRESS, HONESTLY"
        title="每一点进步，都有记录。"
        description="只展示你真正完成的练习。空白也是起点，从今天开始积累。"
      />
      <div className="stat-grid">
        <Stat
          icon={<BookOpen size={20} />}
          title="累计有效练习"
          value={state.attempts.length}
          unit="次"
          testId="attempt-count"
        />
        <Stat
          icon={<Clock3 size={20} />}
          title="累计学习时长"
          value={Math.floor(total / 60)}
          unit={`分钟 ${total % 60} 秒`}
        />
        <Stat
          icon={<Flame size={20} />}
          title="连续练习"
          value={streak(dates)}
          unit="天"
        />
        <Stat
          icon={<Check size={20} />}
          title="本周练习"
          value={recent.length}
          unit="次"
        />
      </div>
      <div className="dashboard-grid">
        <div className="panel">
          <div className="section-line">
            <h2>最近 7 天 · 学习时长</h2>
            <span className="small muted">分钟</span>
          </div>
          {state.attempts.length ? (
            <div className="chart">
              <ResponsiveContainer width="100%" height={235} minWidth={0}>
                <BarChart
                  data={data}
                  margin={{ left: -25, right: 12, top: 20 }}
                >
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--muted)", fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--muted)", fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                    }}
                  />
                  <Bar
                    dataKey="分钟"
                    fill="#498e83"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={34}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty chart-empty">
              <Layers3 size={30} />
              <h3>你的学习曲线，从下一次练习开始。</h3>
              <p>完成任意课程，这里就会留下记录。</p>
              <Link className="text-link" href="/today">
                开始今天的学习 <ArrowUpRight size={15} />
              </Link>
            </div>
          )}
          <p className="small muted">
            时间只来自明确提交的练习记录；0 表示没有保存的学习时长。
          </p>
        </div>
        <div className="panel">
          <div className="eyebrow">PRACTICE BY SKILL</div>
          <h2>能力练习分布</h2>
          {skills.map((k) => {
            const attempts = state.attempts.filter((a) => a.skill === k);
            const scored = attempts.filter((a) => a.score !== null);
            return (
              <div className="skill-row" key={k}>
                <div>
                  <span className={`dot ${k}`} />
                  {labels[k]}
                  <small>{attempts.length} 次练习</small>
                </div>
                <strong>
                  {scored.length
                    ? `${Math.round((scored.reduce((n, a) => n + (a.score ?? 0), 0) / scored.length) * 100)}%`
                    : "—"}
                </strong>
                <div className="skill-bar">
                  <i
                    className={k}
                    style={{
                      width: `${state.attempts.length ? (attempts.length / state.attempts.length) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
          <p className="small muted">
            百分比为各项已评分练习的平均正确率。口语与写作未评分，不据此推算能力等级。
          </p>
        </div>
      </div>
      <AnalyticsExtension />
      <div className="panel history-panel">
        <div className="section-line">
          <h2>最近的学习足迹</h2>
          <Link href="/today" className="text-link">
            继续积累 <ArrowUpRight size={15} />
          </Link>
        </div>
        {state.attempts.length ? (
          <div className="history-table">
            {state.attempts
              .slice(-10)
              .reverse()
              .map((a) => (
                <div key={a.id}>
                  <span className={`dot ${a.skill}`} />
                  <strong>{labels[a.skill]}</strong>
                  <span>{a.contentId}</span>
                  <span>{a.date}</span>
                  <span>
                    {a.score === null
                      ? "未评分"
                      : `${Math.round(a.score * 100)}%`}
                  </span>
                </div>
              ))}
          </div>
        ) : (
          <p className="muted">暂无记录。完成练习后会自动保存。</p>
        )}
      </div>
    </>
  );
}
function Stat({
  icon,
  title,
  value,
  unit,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  unit: string;
  testId?: string;
}) {
  return (
    <div className="panel stat">
      <div>
        {icon}
        <span>{title}</span>
      </div>
      <strong data-testid={testId}>
        {value}
        <small>{unit}</small>
      </strong>
    </div>
  );
}
export function LearningPlan() {
  const { state } = useStudy();
  const day = Math.max(1, daysBetween(state.profile.startDate, today()) + 1),
    active = phaseForDay(day);
  return (
    <>
      <PageHeading
        eyebrow="LEARNING PLAN · YOUR 365-DAY JOURNEY"
        title="心里有方向，脚下有计划。"
        description="四个阶段是路线参考，不根据日历宣称能力达标。后续阶段的考试专项内容会逐步补充。"
      />
      <div className="panel plan-budget">
        <div>
          <span className="eyebrow">DAILY BALANCED PLAN</span>
          <h2>
            {state.settings.dailyMinutes}
            <small>分钟 / 天</small>
          </h2>
          <p>听说读写均衡提升 · 每周学习 {state.settings.weeklyDays} 天</p>
        </div>
        <div className="plan-distribution">
          <div className="allocation-bar">
            {skills.map((k) => (
              <span
                className={k}
                style={{
                  width: `${(state.settings.effective[k] / state.settings.dailyMinutes) * 100}%`,
                }}
                key={k}
              />
            ))}
          </div>
          <div className="allocation-legend">
            {skills.map((k) => (
              <span key={k}>
                <i className={`dot ${k}`} />
                {labels[k]} <strong>{state.settings.effective[k]} min</strong>
              </span>
            ))}
          </div>
          <Link className="text-link" href="/settings">
            编辑基础计划 <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
      <div className="phase-grid">
        {phases.map((p, i) => (
          <div
            className={`panel phase ${i === active ? "current" : ""}`}
            key={p.title}
          >
            <div className="section-line">
              <span className="phase-number">0{i + 1}</span>
              <span className="tag">
                {i === active
                  ? "当前日历阶段"
                  : i > active
                    ? "接下来"
                    : "已过日历阶段"}
              </span>
            </div>
            <span className="eyebrow">{p.days}</span>
            <h2>{p.title}</h2>
            <p>{p.description}</p>
            <div className="phase-progress">
              <i
                style={{
                  width: `${i < active ? 100 : i === active ? Math.min(100, ((day - [1, 91, 181, 271][i]) / [90, 90, 90, 95][i]) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <AdaptivePlan />
    </>
  );
}
export function Mistakes() {
  return <MistakeBook />;
}
