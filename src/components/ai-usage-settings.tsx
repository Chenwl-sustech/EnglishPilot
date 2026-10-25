"use client";
import { apiFetch } from "@/lib/native/api";

import { useEffect, useState } from "react";
import type { AiQuotaLimits, AiQuotaSnapshot } from "../lib/server/ai-quota";

async function requestUsage(limits?: AiQuotaLimits): Promise<AiQuotaSnapshot> {
  const response = await apiFetch(
    "/api/ai-usage",
    limits
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(limits),
        }
      : { cache: "no-store" },
  );
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "AI 额度读取失败，请稍后重试。");
  return body;
}

export function AiUsageSettings() {
  const [usage, setUsage] = useState<AiQuotaSnapshot | null>(null);
  const [limits, setLimits] = useState<AiQuotaLimits | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void requestUsage()
      .then((body) => {
        if (active) {
          setUsage(body);
          setLimits(body.limits);
        }
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "AI 额度读取失败");
      });
    return () => {
      active = false;
    };
  }, []);

  async function refresh() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = await requestUsage();
      setUsage(body);
      if (!limits) setLimits(body.limits);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 额度读取失败");
    } finally {
      setBusy(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!limits || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = await requestUsage(limits);
      setUsage(body);
      setLimits(body.limits);
      setMessage("AI 额度已保存，当天用量与预留保持累计。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 额度保存失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" id="ai-usage">
      <div className="section-line">
        <div>
          <span className="eyebrow">AI USAGE</span>
          <h2>AI 调用额度</h2>
        </div>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void refresh()}
        >
          刷新用量
        </button>
      </div>
      <p className="small muted">
        按北京时间每日累计。提交前先预留一次调用与 token
        预算；请求失败、超时或服务商用量无法确认时保留预留。
        修改额度与恢复学习备份都会保留当天累计用量。
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!usage && !error && <p role="status">正在读取 AI 额度…</p>}
      {usage && (
        <>
          <p className="small muted">用量日期：{usage.day}（Asia/Shanghai）</p>
          <div className="form-grid" aria-label="今日 AI 用量">
            <article>
              <h3>调用次数</h3>
              <p>
                已用（含预留）：<strong>{usage.calls.used}</strong> /{" "}
                {usage.limits.dailyCalls}
              </p>
              <p>剩余：{usage.calls.remaining} 次</p>
            </article>
            <article>
              <h3>Token 预算</h3>
              <p>已确认用量：{usage.tokens.used.toLocaleString()}</p>
              <p>预留：{usage.tokens.reserved.toLocaleString()}</p>
              <p>
                剩余：<strong>{usage.tokens.remaining.toLocaleString()}</strong>{" "}
                / {usage.limits.dailyTokens.toLocaleString()}
              </p>
            </article>
          </div>
        </>
      )}
      {limits && (
        <form onSubmit={save}>
          <div className="form-grid">
            <label>
              每日调用次数上限
              <input
                type="number"
                required
                min={0}
                max={10000}
                step={1}
                disabled={busy}
                value={limits.dailyCalls}
                onChange={(e) =>
                  setLimits({ ...limits, dailyCalls: Number(e.target.value) })
                }
              />
            </label>
            <label>
              每日 token 预算
              <input
                type="number"
                required
                min={0}
                max={100000000}
                step={1}
                disabled={busy}
                value={limits.dailyTokens}
                onChange={(e) =>
                  setLimits({ ...limits, dailyTokens: Number(e.target.value) })
                }
              />
            </label>
            <label>
              单次最大输出 token
              <input
                type="number"
                required
                min={1}
                max={32768}
                step={1}
                disabled={busy}
                value={limits.maxOutputTokens}
                onChange={(e) =>
                  setLimits({
                    ...limits,
                    maxOutputTokens: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <p className="small muted">
            调用次数或每日预算设为 0 可暂停 AI。预留按完整请求的 UTF-8
            字节数加输出上限保守估算；服务商返回可信用量后才核销预留，实际收费以服务商账单为准。
          </p>
          <button type="submit" className="button" disabled={busy}>
            {busy ? "正在处理…" : "保存 AI 额度"}
          </button>
        </form>
      )}
    </section>
  );
}
