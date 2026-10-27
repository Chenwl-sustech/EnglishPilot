"use client";
import { apiFetch } from "@/lib/native/api";
import { nativeBuild } from "@/lib/native/runtime";
import { isHostedWebClient } from "@/lib/deployment";

import { useEffect, useRef, useState } from "react";
import { ZodError } from "zod";
import type {
  ListeningMaterial,
  TimelineDraft,
} from "@/lib/listening-material-model";
import { listeningAudio } from "@/lib/listening-materials";
import {
  buildTimelineDraft,
  storeTimelineDraft,
  confirmTimelineDraft,
} from "@/lib/listening-timeline";
import { useStudy } from "./study-context";

const remoteClient = nativeBuild || isHostedWebClient;
const message = (e: unknown) =>
  e instanceof ZodError
    ? e.issues
        .slice(0, 3)
        .map((i) => i.message)
        .join("；")
    : e instanceof Error
      ? e.message
      : "时间轴操作失败";
export function ListeningTimelineEditor({
  material: m,
  disabled,
  onBusyChange,
  onPreview,
}: {
  material: ListeningMaterial;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onPreview: (start: number, end: number) => void;
}) {
  const { state, update, notify } = useStudy();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [model, setModel] = useState(state.extension.whisperModel);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function generate() {
    if (remoteClient || busy || disabled) return;
    const operation = new AbortController();
    controller.current = operation;
    const signal = AbortSignal.any([
      operation.signal,
      AbortSignal.timeout(195000),
    ]);
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      if (m.audioBytes > 30000000 || m.duration > 600)
        throw new Error(
          "本地时间轴生成支持30 MB、10分钟以内素材；较长素材请拆分或手工标注",
        );
      if (!m.transcript.trim())
        throw new Error("请先保存可核对的原文，再生成时间轴");
      const health = await apiFetch("/api/whisper", { signal }),
        status = await health.json();
      if (!health.ok) throw new Error(status.error ?? "本地 Whisper 未连接");
      if (
        !status.models?.some(
          (item: { name: string; installed: boolean }) =>
            item.name === model && item.installed,
        )
      )
        throw new Error(
          `${model} 模型尚未安装，请在本地Whisper设置中确认下载；当前操作不会自动下载模型`,
        );
      const audio = await listeningAudio(m.audioId);
      if (!audio) throw new Error("原音不存在，请重新导入同一素材");
      const hash = [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", await audio.blob.arrayBuffer()),
        ),
      ]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      if (hash !== m.audioId) throw new Error("原音校验失败，请重新导入");
      const response = await apiFetch(`/api/whisper?model=${model}`, {
        method: "POST",
        headers: {
          "Content-Type": audio.blob.type || "application/octet-stream",
        },
        body: audio.blob,
        signal,
      });
      const raw = await response.json();
      if (!response.ok) throw new Error(raw.error ?? "本地转写失败");
      signal.throwIfAborted();
      const draft = buildTimelineDraft(m, raw);
      await update((s) =>
        storeTimelineDraft(
          s,
          m.id,
          m.revision,
          draft,
          m.timelineDraft?.id ?? null,
          m.timelineDraft?.editRevision,
        ),
      );
      notify("时间轴草稿已保存；请逐句试听、校对并确认后启用");
    } catch (e) {
      setError(
        operation.signal.aborted
          ? "已取消生成，原音和已有标注保留"
          : message(e),
      );
    } finally {
      controller.current = null;
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <section className="panel timeline-editor" aria-label="本地逐句时间轴">
      <h3>逐句时间轴</h3>
      <p className="small muted">
        {remoteClient
          ? "此设备不提供 Whisper 自动对齐。请在下方“编辑原文、题目与时间轴”中手工标注起止秒数，并回听校对；已有时间轴和草稿仍可查看。"
          : "使用本机Whisper的词级时间戳与已保存原文匹配；本次转写不发送到外网。草稿不会替换原文或已有时间轴；识别结果可能有误，确认前请回听校对。"}
      </p>
      {m.timelineProvenance && (
        <p className="small">
          当前时间轴：
          {m.timelineProvenance.method === "manual"
            ? "手工标注"
            : `${m.timelineProvenance.model} 词级对齐，已人工确认`}{" "}
          · {m.segments.length} 个片段
        </p>
      )}
      {!remoteClient && <div className="actions">
        <label>
          时间轴本地模型
          <select
            value={model}
            disabled={busy || disabled}
            onChange={(e) => setModel(e.target.value as typeof model)}
          >
            {["tiny", "base", "small"].map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button secondary"
          disabled={busy || disabled}
          onClick={() => void generate()}
        >
          本地生成时间轴草稿
        </button>
        {busy && (
          <button
            className="button secondary"
            onClick={() => controller.current?.abort()}
          >
            取消生成
          </button>
        )}
      </div>}
      {busy && <p role="status">正在本地转写并匹配原文，请保持页面打开…</p>}
      {error && <p role="alert">{error}</p>}
      {m.timelineDraft && (
        <DraftReview
          key={`${m.timelineDraft.id}:${m.timelineDraft.editRevision}`}
          material={m}
          draft={m.timelineDraft}
          disabled={busy || disabled}
          onPreview={onPreview}
        />
      )}
    </section>
  );
}
function DraftReview({
  material: m,
  draft,
  disabled,
  onPreview,
}: {
  material: ListeningMaterial;
  draft: TimelineDraft;
  disabled: boolean;
  onPreview: (start: number, end: number) => void;
}) {
  const { update, notify } = useStudy();
  const [segments, setSegments] = useState(draft.segments),
    [checked, setChecked] = useState(false),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  function change(
    index: number,
    patch: Partial<TimelineDraft["segments"][number]>,
  ) {
    setChecked(false);
    setSegments((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }
  async function save(confirm: boolean) {
    if (saving || disabled) return;
    setSaving(true);
    setError("");
    try {
      if (confirm && !checked) throw new Error("请先回听并校对这些片段");
      await update((s) =>
        confirm
          ? confirmTimelineDraft(
              s,
              m.id,
              m.revision,
              draft.id,
              segments,
              draft.editRevision,
            )
          : storeTimelineDraft(
              s,
              m.id,
              m.revision,
              { ...draft, segments },
              draft.id,
              draft.editRevision,
            ),
      );
      notify(
        confirm
          ? "逐句时间轴已确认启用，可用于听写、跟读和每日任务"
          : "时间轴草稿已保存，尚未启用",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div data-testid="timeline-draft">
      <p>
        <strong>待校对草稿 · {segments.length} 句</strong> · {draft.model} ·
        原文词匹配率 {Math.round(draft.coverage * 100)}%
      </p>
      <p className="small muted">
        {draft.omittedSentences}{" "}
        句未可靠匹配，未生成时间；词匹配率不等于时间戳准确度。仅确认的片段进入逐句训练。
      </p>
      <fieldset disabled={disabled || saving}>
        <div className="timeline-rows">
          {segments.map((segment, i) => (
            <div className="timeline-row" key={segment.id}>
              <strong>第 {i + 1} 句</strong>
              <div className="timeline-times">
                <label>
                  开始秒
                  <input
                    aria-label={`草稿第 ${i + 1} 句开始秒`}
                    type="number"
                    min="0"
                    max={draft.decodedDuration}
                    step="0.01"
                    value={segment.start}
                    onChange={(e) =>
                      change(i, { start: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  结束秒
                  <input
                    aria-label={`草稿第 ${i + 1} 句结束秒`}
                    type="number"
                    min="0"
                    max={draft.decodedDuration}
                    step="0.01"
                    value={segment.end}
                    onChange={(e) => change(i, { end: Number(e.target.value) })}
                  />
                </label>
                <button
                  className="button secondary compact"
                  onClick={() => {
                    setError("");
                    if (
                      segment.start >= segment.end ||
                      segment.start < 0 ||
                      segment.end > draft.decodedDuration
                    ) {
                      setError("请先修正本句起止时间");
                      return;
                    }
                    onPreview(segment.start, segment.end);
                  }}
                >
                  试听草稿第 {i + 1} 句
                </button>
              </div>
              <label>
                片段原文
                <textarea
                  aria-label={`草稿第 ${i + 1} 句原文`}
                  rows={2}
                  value={segment.text}
                  onChange={(e) => change(i, { text: e.target.value })}
                />
              </label>
              <button
                className="text-button"
                onClick={() => {
                  setChecked(false);
                  setSegments((rows) => rows.filter((_, n) => n !== i));
                }}
              >
                移除此片段
              </button>
            </div>
          ))}
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          我已回听并校对这些片段
        </label>
        <div className="actions">
          <button className="button secondary" onClick={() => void save(false)}>
            保存时间轴草稿
          </button>
          <button
            className="button primary"
            disabled={!checked || segments.length === 0}
            onClick={() => void save(true)}
          >
            确认启用逐句时间轴
          </button>
        </div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
