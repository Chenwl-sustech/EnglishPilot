"use client";
import { apiFetch } from "@/lib/native/api";

import { useEffect, useState } from "react";
import { evaluationSchema } from "@/lib/adaptive-model";
import { saveEvaluation } from "@/lib/evaluations";
import { useStudy } from "./study-context";
import type { Attempt } from "@/lib/model";
export function AiFeedback({
  attempt,
  exam,
  taskType,
  prompt,
  text,
  previousText,
}: {
  attempt: Attempt;
  exam: "ielts" | "toefl";
  taskType: string;
  prompt: string;
  text?: string;
  previousText?: string;
}) {
  const { state, update, fail } = useStudy();
  const [config, setConfig] = useState<{
      configured: boolean;
      local: boolean;
      model: string;
      message: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void apiFetch("/api/evaluate")
      .then(async (response) => {
        const data = await response.json();
        if (!alive) return;
        if (!response.ok) {
          setError(
            typeof data?.error === "string"
              ? data.error
              : "AI 服务设置暂不可用，请稍后刷新重试。",
          );
          return;
        }
        setConfig(data);
      })
      .catch(() => {
        if (alive)
          setError(
            "无法检查 AI 服务设置，请联网后刷新重试；已保存的练习仍保留。",
          );
      });
    return () => {
      alive = false;
    };
  }, []);
  const result = state.extension.evaluations
    .filter((e) => e.attemptId === attempt.id)
    .at(-1);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: attempt.id,
          skill: attempt.skill,
          exam,
          taskType,
          prompt,
          text: text ?? attempt.answer,
          previousText,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "AI 反馈失败");
      const evaluation = evaluationSchema.parse(body);
      await update((s) => saveEvaluation(s, evaluation));
    } catch (e) {
      setError(e instanceof Error ? e.message : "反馈失败");
    } finally {
      setBusy(false);
    }
  }
  async function dispute() {
    if (!result) return;
    const reason = window.prompt("请说明哪一处反馈存在争议");
    if (!reason?.trim()) return;
    try {
      await update((s) => ({
        ...s,
        extension: {
          ...s.extension,
          evaluations: s.extension.evaluations.map((e) =>
            e.id === result.id ? { ...e, disputed: true } : e,
          ),
          mistakes: s.extension.mistakes.map((m) =>
            m.source === result.id ? { ...m, status: "disputed" } : m,
          ),
          disputes: [
            ...s.extension.disputes,
            {
              id: crypto.randomUUID(),
              targetId: result.id,
              kind: "evaluation",
              reason,
              createdAt: new Date().toISOString(),
            },
          ],
        },
      }));
    } catch (e) {
      fail(e);
    }
  }
  const input = result?.inputText ?? text ?? attempt.answer;
  const errors = [...(result?.errors ?? [])].sort((a, b) => a.start - b.start);
  let cursor = 0;
  const highlight: React.ReactNode[] = [];
  for (const [i, e] of errors.entries()) {
    if (e.start < cursor || e.end > input.length) continue;
    highlight.push(
      input.slice(cursor, e.start),
      <mark key={i} title={`${e.explanation} → ${e.suggestion}`}>
        {input.slice(e.start, e.end)}
      </mark>,
    );
    cursor = e.end;
  }
  highlight.push(input.slice(cursor));
  return (
    <section className="panel ai-feedback">
      <div className="section-line">
        <h2>AI 语言反馈</h2>
        <span className="tag">AI 模拟评价，非官方考试成绩</span>
      </div>
      <p className="small muted">
        {config?.message ??
          (error ? "AI 服务设置暂不可用。" : "正在检查 AI 设置…")}{" "}
        {config?.model && `模型：${config.model}`}
      </p>
      {!config?.local && (
        <p className="small muted">
          点击后会把当前文本及前一篇文本（如有）发送给配置的 AI
          服务；本次 AI 分析不发送录音。需要完全本地时，请配置本机兼容 Responses API
          的服务。
        </p>
      )}
      <button
        className="button primary"
        disabled={busy || !config?.configured}
        onClick={() => void submit()}
      >
        {busy ? "正在分析…" : result ? "重新分析已保存版本" : "分析已保存版本"}
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p className="small">
            {result.rubric} ·{" "}
            {new Date(result.createdAt).toLocaleString("zh-CN")}{" "}
            {result.disputed && "· 已标记争议，排除自适应"}
          </p>
          <div className="feedback-dimensions">
            {result.dimensions.map((d) => (
              <article key={d.name}>
                <strong>
                  {d.name}{" "}
                  {d.score === null ? "暂无法可靠评分" : `${d.score}/${d.max}`}
                </strong>
                <p>{d.evidence}</p>
              </article>
            ))}
          </div>
          <h3>优先改进</h3>
          <ol>
            {result.suggestions.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ol>
          <details open>
            <summary>原文错误高亮 · {result.errors.length} 处</summary>
            <p className="mistake-text" lang="en">
              {highlight}
            </p>
            {result.errors.map((e, i) => (
              <div key={i} className="version">
                <strong>
                  {e.category} · {e.original}
                </strong>
                <p>{e.explanation}</p>
                <p>建议：{e.suggestion}</p>
                <p lang="en">{e.example}</p>
              </div>
            ))}
          </details>
          <details>
            <summary>修改参考</summary>
            <p className="mistake-text" lang="en">
              {result.revised}
            </p>
          </details>
          {result.exemplar && (
            <details>
              <summary>更高水平参考范文</summary>
              <p className="mistake-text" lang="en">
                {result.exemplar}
              </p>
            </details>
          )}
          <p>{result.comparison}</p>
          {result.limitations.map((v) => (
            <p className="small muted" key={v}>
              {v}
            </p>
          ))}
          <button className="button secondary" onClick={() => void dispute()}>
            对反馈提出异议
          </button>
          <p className="small muted">
            主观错误进入错题本后，需确认知识点才能启动 FSRS 复习。评分标准：
            <a
              href={
                exam === "ielts"
                  ? `https://ielts.org/cdn/ielts-guides/ielts-${attempt.skill === "speaking" ? "speaking" : "writing"}-band-descriptors.pdf`
                  : `https://www.ets.org/pdfs/toefl/${attempt.skill === "speaking" ? "speaking" : "writing"}-rubrics.pdf`
              }
              target="_blank"
              rel="noreferrer"
            >
              公开评价标准
            </a>
          </p>
        </>
      )}
    </section>
  );
}
