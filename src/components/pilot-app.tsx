"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  LayoutGrid,
  Sun,
  BookOpen,
  Headphones,
  Mic,
  PenLine,
  Layers3,
  GraduationCap,
  NotebookPen,
  Sparkles,
  ChartNoAxesCombined,
  Route,
  Settings2,
  Menu,
  X,
  Moon,
  Check,
  LockKeyhole,
} from "lucide-react";
import { StudyProvider, useStudy } from "./study-context";
import { Onboarding, Assessment } from "./onboarding";
import { Today, Dashboard, LearningPlan, Mistakes } from "./overview";
import { ExerciseList, Vocabulary, Writing, Speaking } from "./exercises";
import { Settings } from "./settings";
import { CalendarPage } from "./calendar-page";
import { CalendarCheck } from "./calendar-check";
import { MiniTest } from "./mini-test";
import { MockExams } from "./mock-exams";
import { SpeakingTeacher } from "./speaking-teacher";
import { usePronunciationCleanup } from "./use-pronunciation-cleanup";
import { WordCollector } from "./word-collector";
import { ReadingTrainer } from "./reading-trainer";
import { ListeningLab } from "./listening-lab";
import { PublicResources } from "./public-resources";
import { daysBetween, today } from "@/lib/engine";
const nav = [
  {
    group: "我的学习",
    items: [
      ["dashboard", "学习总览", LayoutGrid],
      ["today", "今日学习", Sun],
      ["calendar", "学习日历", Route],
    ],
  },
  {
    group: "日常练习",
    items: [
      ["vocabulary", "词汇学习", Layers3],
      ["resources", "题库与资源", BookOpen],
      ["grammar", "语法课程", BookOpen],
      ["listening", "听力训练", Headphones],
      ["reading", "阅读训练", BookOpen],
      ["speaking", "口语训练", Mic],
      ["writing", "写作练习", PenLine],
    ],
  },
  {
    group: "回顾与成长",
    items: [
      ["mini-test", "小测与历史", NotebookPen],
      ["exams", "模拟考试", GraduationCap],
      ["mistakes", "错题与复习", NotebookPen],
      ["teacher", "AI 教师", Sparkles],
      ["analytics", "学习分析", ChartNoAxesCombined],
      ["plan", "学习计划", Route],
    ],
  },
] as const;
export function PilotApp({ section }: { section: string }) {
  return (
    <StudyProvider>
      <App section={section} />
    </StudyProvider>
  );
}
function App({ section }: { section: string }) {
  const { state, update } = useStudy();
  const pathname = usePathname();
  usePronunciationCleanup(pathname);
  const [open, setOpen] = useState(false);
  const title =
    nav
      .map((group) => group.items.find((item) => item[0] === section)?.[1])
      .find(Boolean) ??
    (section === "settings"
      ? "设置"
      : section === "mini-test"
        ? "小测与历史"
        : "基础评估");
  const day = Math.max(1, daysBetween(state.profile.startDate, today()) + 1);
  if (!state.profile.onboarded) return <Onboarding />;
  const views: Record<string, React.ReactNode> = {
    today: <Today />,
    calendar: <CalendarPage />,
    "mini-test": <MiniTest />,
    dashboard: <Dashboard />,
    vocabulary: <Vocabulary />,
    resources: <PublicResources />,
    grammar: <ExerciseList kind="grammar" />,
    listening: <ListeningLab />,
    reading: <ReadingTrainer />,
    speaking: <Speaking />,
    writing: <Writing />,
    mistakes: <Mistakes />,
    analytics: <Dashboard />,
    plan: <LearningPlan />,
    settings: <Settings />,
    assessment: <Assessment />,
    exams: <MockExams />,
    teacher: <SpeakingTeacher />,
  };
  return (
    <div className="app-shell">
      <CalendarCheck />
      <WordCollector />
      {open && (
        <button
          className="sidebar-scrim"
          aria-label="关闭导航背景"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <Link href="/today" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark">
            <Compass size={23} />
          </span>
          <span>
            EnglishPilot<small>YOUR PERSONAL LEARNING COACH</small>
          </span>
        </Link>
        <button
          className="mobile-close icon-button"
          aria-label="关闭导航"
          onClick={() => setOpen(false)}
        >
          <X size={21} />
        </button>
        <nav aria-label="主导航">
          {nav.map((group) => (
            <div className="nav-group" key={group.group}>
              <div className="nav-label">{group.group}</div>
              {group.items.map(([id, label, Icon]) => (
                <Link
                  href={`/${id}`}
                  key={id}
                  className={`nav-item ${section === id ? "active" : ""}`}
                  onClick={() => setOpen(false)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  {id === "teacher" && (
                    <i className="nav-dev-dot" title="开发中" />
                  )}
                  {section === id && <span className="nav-active-dot" />}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="journey-card">
            <div className="section-line">
              <span>365 天成长之旅</span>
              <span>{Math.min(100, Math.floor((day / 365) * 100))}%</span>
            </div>
            <div className="journey-progress">
              <i style={{ width: `${Math.min(100, (day / 365) * 100)}%` }} />
            </div>
            <small>
              DAY {String(day).padStart(3, "0")}{" "}
              <span>每一天，都更近一步。</span>
            </small>
          </div>
          <Link
            href="/settings"
            className={`nav-item ${section === "settings" ? "active" : ""}`}
            onClick={() => setOpen(false)}
          >
            <Settings2 size={18} />
            设置
          </Link>
          <div className="profile-chip">
            <div>{state.profile.name.slice(0, 1) || "E"}</div>
            <span>
              {state.profile.name}
              <small>我的个人学习空间</small>
            </span>
            <LockKeyhole size={14} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="打开导航"
              onClick={() => setOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>我的学习空间</span>
            <i>/</i>
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="save-status">
              <Check size={13} />
              本地保存
            </span>
            <span className="header-date">
              {new Date(`${today()}T12:00:00`).toLocaleDateString("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </span>
            <button
              className="icon-button theme-button"
              aria-label="切换深浅色主题"
              onClick={() =>
                void update((s) => ({
                  ...s,
                  settings: {
                    ...s.settings,
                    theme: s.settings.theme === "light" ? "dark" : "light",
                  },
                })).catch(() => {})
              }
            >
              {state.settings.theme === "light" ? (
                <Moon size={17} />
              ) : (
                <Sun size={17} />
              )}
            </button>
          </div>
        </header>
        <main className="main-content" key={pathname}>
          {views[section] ?? views.today}
          <footer className="app-footer">
            <span>
              EnglishPilot <i>·</i> Learn a little. Grow a lot.
            </span>
            <span>
              本地优先 <i>·</i> Adaptive v3
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
