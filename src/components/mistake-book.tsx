"use client";
import { useState } from "react";
import Link from "next/link";
import { useStudy } from "./study-context";
import { confirmMistake, reviewMistake, mergeMistakes } from "@/lib/mistakes";
import { recordAttempt, today } from "@/lib/engine";
import { labels, type Skill } from "@/lib/model";
import {
  formatReviewInterval,
  previewFsrs,
  type ReviewRating,
} from "@/lib/fsrs";
const routes: Record<Skill, string> = {
  foundation: "/grammar",
  listening: "/listening",
  reading: "/reading",
  writing: "/writing",
  speaking: "/speaking",
};
export function MistakeBook() {
  const { state, update, fail } = useStudy();
  const [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<string[]>([]),
    [revealed, setRevealed] = useState<string[]>([]);
  const rows = state.extension.mistakes
    .filter((m) => filter === "all" || m.skill === filter)
    .slice()
    .sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate));
  async function review(id: string, rating: ReviewRating) {
    try {
      await update((s) => {
        const m = s.extension.mistakes.find((m) => m.id === id)!;
        const reviewed = reviewMistake(s, id, rating);
        return recordAttempt(reviewed, {
          id: crypto.randomUUID(),
          contentId: id,
          skill: m.skill,
          date: today(),
          createdAt: new Date().toISOString(),
          seconds: 0,
          score: null,
          answer: `错题 FSRS 自评：${rating}`,
          errors: [],
        });
      });
      setRevealed(revealed.filter((x) => x !== id));
    } catch (e) {
      fail(e);
    }
  }
  return (
    <>
      <div className="section-line">
        <div>
          <h1>统一错题与复习</h1>
          <p className="muted">
            保留真实作答、错误分类与重复次数。主观反馈先确认知识点，再使用 FSRS
            复习。
          </p>
        </div>
        <span className="tag">
          {state.extension.mistakes.length} 条 · 已解决{" "}
          {
            state.extension.mistakes.filter((m) => m.status === "resolved")
              .length
          }
        </span>
      </div>
      <div className="tabs">
        {[
          "all",
          "foundation",
          "listening",
          "reading",
          "writing",
          "speaking",
        ].map((k) => (
          <button
            key={k}
            className={filter === k ? "active" : ""}
            onClick={() => setFilter(k)}
          >
            {k === "all" ? "全部" : labels[k as Skill]}
          </button>
        ))}
      </div>
      <button
        className="button secondary"
        disabled={selected.length < 2}
        onClick={() =>
          void update((s) => mergeMistakes(s, selected))
            .then(() => setSelected([]))
            .catch(fail)
        }
      >
        合并已选的同类知识点
      </button>
      <div className="mistake-list">
        {rows.map((m) => {
          const shown = revealed.includes(m.id),
            previews = previewFsrs(m.fsrs);
          const attempt = state.attempts.find((a) =>
            m.attemptIds.includes(a.id),
          );
          const exercise = attempt?.contentId ?? m.source.split(":q")[0];
          const route =
            m.skill === "foundation" &&
            (exercise.startsWith("w") || exercise.startsWith("personal:"))
              ? "/vocabulary"
              : routes[m.skill];
          return (
            <article className="panel" key={m.id} id={m.id}>
              <div className="section-line">
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(m.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, m.id]
                          : selected.filter((x) => x !== m.id),
                      )
                    }
                  />{" "}
                  {labels[m.skill]} · {m.category}
                </label>
                <span className="tag">
                  出现 {m.count} 次 · {m.lastDate} · {m.status}
                </span>
              </div>
              <h3>{m.original}</h3>
              <p className="mistake-text">你的作答：{m.response}</p>
              <p className="small muted">
                {m.questionType} · 来源 {m.source}
                {m.nextReview &&
                  ` · 下次 ${new Date(m.nextReview).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`}
              </p>
              <div className="actions">
                <button
                  className="button secondary"
                  onClick={() =>
                    setRevealed(
                      shown
                        ? revealed.filter((x) => x !== m.id)
                        : [...revealed, m.id],
                    )
                  }
                >
                  {shown ? "隐藏答案" : "回想后查看答案"}
                </button>
                <Link
                  className="text-link"
                  href={`${route}?exercise=${encodeURIComponent(exercise)}`}
                >
                  原题复练
                </Link>
                {m.status === "pending-confirmation" && (
                  <button
                    className="button primary"
                    onClick={() =>
                      void update((s) => confirmMistake(s, m.id)).catch(fail)
                    }
                  >
                    确认此知识点并加入 FSRS
                  </button>
                )}
                {m.status !== "pending-confirmation" &&
                  !m.fsrs &&
                  m.status !== "disputed" && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        void update((s) => confirmMistake(s, m.id)).catch(fail)
                      }
                    >
                      加入 FSRS 复习
                    </button>
                  )}
              </div>
              {shown && (
                <>
                  <p className="mistake-text">
                    建议 / 正确答案：{m.correction}
                  </p>
                  <p className="mistake-text">{m.explanation}</p>
                  {m.status !== "pending-confirmation" &&
                    m.status !== "disputed" && (
                      <div className="actions">
                        {(["again", "hard", "good", "easy"] as const).map(
                          (rating, i) => (
                            <button
                              className="button secondary"
                              key={rating}
                              onClick={() => void review(m.id, rating)}
                            >
                              {["Again", "Hard", "Good", "Easy"][i]} ·{" "}
                              {formatReviewInterval(previews[rating].card.due)}
                            </button>
                          ),
                        )}
                      </div>
                    )}
                </>
              )}
            </article>
          );
        })}
        {!rows.length && (
          <div className="panel empty spacious">
            <h2>还没有需要回看的错题。</h2>
            <p>完成客观练习或确认写作反馈后，这里会保存真实错误。</p>
            <Link href="/reading" className="button primary">
              开始阅读练习
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
