"use client";
import { apiFetch } from "@/lib/native/api";

import { useEffect, useState } from "react";
import { db, type Recording } from "@/lib/db";
import { speechAnalysisSchema } from "@/lib/adaptive-model";
import { recordAttempt, today } from "@/lib/engine";
import { useStudy } from "./study-context";
import { AiFeedback } from "./ai-feedback";
import { speakingPrompts } from "@/lib/content";
import { alignDictation } from "@/lib/listening";
import { isHostedWebClient } from "@/lib/deployment";
import { nativeBuild } from "@/lib/native/runtime";
type Model = {
  name: string;
  size: number;
  path: string;
  installed: boolean;
  resources: { memoryNote: string };
  currentDownload: {
    state: string;
    downloadedBytes?: number;
    error?: string;
  } | null;
  error?: string;
};
type Status = {
  runtime: {
    available: boolean;
    missingPackages: string[];
    cudaReady: boolean;
  };
  models: Model[];
};
export function WhisperPanel() {
  const { state, update, fail } = useStudy();
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [recordings, setRecordings] = useState<Recording[]>([]),
    [id, setId] = useState(""),
    [busy, setBusy] = useState(false),
    [transcript, setTranscript] = useState("");
  const model = state.extension.whisperModel;
  const analysis = state.extension.speechAnalyses
      .filter((a) => a.recordingId === id)
      .at(-1),
    attempt = state.attempts.find(
      (a) =>
        a.id === id ||
        a.id ===
          state.extension.shadowing.find((row) => row.recordingId === id)?.id,
    ),
    recording = recordings.find((r) => r.id === id);
  const speakingIndex = Number(
    attempt?.contentId.match(/^speaking-(\d+)$/)?.[1],
  );
  const mock=state.extension.practiceSessions.find(p=>Object.values(p.audio).includes(id));
  const mockItem=mock?.sections.flatMap(s=>s.items).find(i=>mock.audio[i.id]===id);
  const prompt = Number.isInteger(speakingIndex)
    ? speakingPrompts[speakingIndex]
    : undefined;
  const exam = mock?.exam ?? (prompt?.[2].includes("TOEFL")
    ? "toefl"
    : prompt?.[2].includes("IELTS")
      ? "ielts"
      : state.profile.mode === "dual"
        ? state.profile.primary
        : state.profile.mode);
  async function refresh() {
    try {
      const response = await apiFetch("/api/whisper");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setStatus(body);
      setError("");
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : "本地服务不可用");
    }
  }
  useEffect(() => {
    if (!nativeBuild) void refresh();
  }, []);
  useEffect(() => {
    let alive = true;
    void db.recordings
      .toArray()
      .then((rows) => {
        if (alive) {
          setRecordings(rows);
          setId((old) => old || rows.at(-1)?.id || "");
        }
      })
      .catch(fail);
    return () => {
      alive = false;
    };
  }, [state.attempts.length, fail]);
  useEffect(() => {
    setTranscript(state.drafts[`speech-notes:${id}`] ?? analysis?.text ?? "");
  }, [analysis?.id, analysis?.text, id, state.drafts]);
  const selected = status?.models.find((m) => m.name === model);
  const shadow = state.extension.shadowing.find(
    (row) => row.recordingId === id,
  );
  const aligned =
    shadow && transcript.trim()
      ? alignDictation(shadow.reference, transcript)
      : null;
  useEffect(() => {
    if (!status?.models.some((m) => m.currentDownload?.state === "downloading"))
      return;
    const interval = setInterval(() => void refresh(), 2000);
    return () => clearInterval(interval);
  }, [status]);
  async function download() {
    if (
      !selected ||
      !window.confirm(
        `下载 ${model} 模型，约 ${(selected.size / 1e6).toFixed(1)} MB？保存到 ${selected.path}。仅下载模型，不上传录音。`,
      )
    )
      return;
    setBusy(true);
    try {
      const r = await apiFetch(`/api/whisper?model=${model}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "下载失败");
    } finally {
      setBusy(false);
    }
  }
  async function transcribe() {
    if (isHostedWebClient) {
      setError("网页版不提供设备本地转写；录音保留在当前浏览器，可回放或手工填写文本。");
      return;
    }
    if (!recording) return;
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch(`/api/whisper?model=${model}`, {
        method: "POST",
        headers: {
          "Content-Type": recording.blob.type || "application/octet-stream",
        },
        body: recording.blob,
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      const result = speechAnalysisSchema.parse({
        ...body,
        id: crypto.randomUUID(),
        recordingId: id,
        createdAt: new Date().toISOString(),
      });
      await update((s) => ({
        ...s,
        extension: {
          ...s.extension,
          speechAnalyses: [...s.extension.speechAnalyses, result],
          shadowing: s.extension.shadowing.map((row) =>
            row.recordingId === id ? { ...row, transcript: result.text } : row,
          ),
        },
      }));
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "转写失败") +
          " 录音已保留，可回放或手工自评。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function importAudio(file?: File) {
    if (!file) return;
    try {
      if (file.size > 30000000) throw new Error("请选择 30 MB 以内音频");
      const audio = new Audio(URL.createObjectURL(file));
      const duration = await new Promise<number>((resolve, reject) => {
        audio.onloadedmetadata = () => resolve(audio.duration);
        audio.onerror = () => reject(new Error("浏览器无法读取音频"));
      });
      URL.revokeObjectURL(audio.src);
      if (!Number.isFinite(duration) || duration > 600)
        throw new Error("音频应不超过 10 分钟");
      const key = crypto.randomUUID();
      await db.transaction("rw", [db.recordings, db.state], async () => {
        await db.recordings.put({
          id: key,
          blob: file,
          date: today(),
          title: file.name,
        });
        const row = await db.state.get("main");
        if (!row) throw new Error("请先初始化学习记录");
        await db.state.put({
          id: "main",
          value: recordAttempt(row.value, {
            id: key,
            contentId: "speaking-import",
            skill: "speaking",
            date: today(),
            createdAt: new Date().toISOString(),
            seconds: Math.floor(duration),
            score: null,
            answer: `本地导入录音：${file.name}`,
            errors: [],
          }),
        });
      });
      await update((s) => s);
      setId(key);
    } catch (e) {
      fail(e);
    }
  }
  return (
    <section className="panel whisper-panel" id="whisper">
      <div className="section-line">
        <h2>{nativeBuild ? "录音回放与文字自评" : "本地 Whisper · 口语与跟读分析"}</h2>
        <span className="tag">{nativeBuild ? "录音保存在设备" : "可选本地服务"}</span>
      </div>
      <p className="small muted">
        {nativeBuild ? "安装版暂不提供设备本地转写。请回放录音后手工填写回答，保存文字后可请求 AI 语言反馈；录音不会上传。" : <>公开源码包未附带 Whisper 服务，可另行配置兼容的本机 127.0.0.1:8765 服务。未配置时仍可录音、回放及手工自评。</>}
      </p>
      {!nativeBuild && <button className="button secondary" onClick={() => void refresh()}>
        刷新本地模型状态
      </button>}
      {error && <p role="alert">{error}</p>}
      <div className="form-grid">
        {!nativeBuild && <label>
          模型
          <select
            aria-label="Whisper 模型"
            value={model}
            onChange={(e) => {
              const value = e.target.value as "tiny" | "base" | "small";
              void update((s) => ({
                ...s,
                extension: { ...s.extension, whisperModel: value },
              })).catch(fail);
            }}
          >
            {(
              status?.models ?? [
                { name: "tiny" },
                { name: "base" },
                { name: "small" },
              ]
            ).map((m) => (
              <option key={m.name}>{m.name}</option>
            ))}
          </select>
        </label>}
        <label>
          已保存录音
          <select value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">选择录音</option>
            {recordings.map((r) => (
              <option value={r.id} key={r.id}>
                {r.date} · {r.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          导入自己的音频
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => {
              void importAudio(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {!nativeBuild && selected && (
        <>
          <p className="small">
            {selected.name} · {(selected.size / 1e6).toFixed(1)} MB ·{" "}
            {selected.installed ? "已安装" : "未安装"} ·{" "}
            {status?.runtime.available
              ? "运行时可用"
              : `缺少运行时：${status?.runtime.missingPackages.join(", ")}`}
            <br />
            保存位置：{selected.path}
            <br />
            {selected.resources.memoryNote}
            <br />
            下载状态：{selected.currentDownload?.state ?? "空闲"}{" "}
            {selected.error ?? selected.currentDownload?.error}
          </p>
          {!selected.installed && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void download()}
            >
              确认后下载 {model}
            </button>
          )}
        </>
      )}
      {!nativeBuild && <button
        className="button primary"
        disabled={
          busy ||
          !selected?.installed ||
          !status?.runtime.available ||
          !recording
        }
        onClick={() => void transcribe()}
      >
        {busy ? "本地处理中…" : "本地转写所选录音"}
      </button>}
      {analysis && (
        <>
          <div className="feedback-dimensions">
            <p>
              录音 {analysis.duration.toFixed(1)} 秒 · VAD 语音{" "}
              {analysis.speechDuration.toFixed(1)} 秒
            </p>
            <p>
              WPM {analysis.wpm ?? "—"} · 估计停顿 {analysis.pauseCount} 次 /{" "}
              {analysis.pauseDuration.toFixed(1)} 秒
            </p>
            <p>
              相邻重复 {analysis.repetitions ?? "—"} · 词汇多样性{" "}
              {analysis.vocabularyDiversity === null
                ? "—"
                : `${Math.round(analysis.vocabularyDiversity * 100)}%`}
            </p>
          </div>
          {analysis.limitations.map((v) => (
            <p className="small muted" key={v}>
              {v}
            </p>
          ))}
          <details>
            <summary>句段与词级时间戳</summary>
            {analysis.segments.map((s, i) => (
              <p key={i}>
                [{s.start.toFixed(2)}–{s.end.toFixed(2)}] {s.text}
              </p>
            ))}
            <p className="small">
              {analysis.words
                .map(
                  (w) =>
                    `${w.word.trim()} [${w.start.toFixed(2)}–${w.end.toFixed(2)}]`,
                )
                .join(" · ")}
            </p>
          </details>
        </>
      )}
      <label>
        核对转写 / 手工自评笔记
        <textarea
          aria-label="核对转写或手工自评"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
        />
      </label>
      {shadow && aligned && (
        <div className="soft-note">
          <p lang="en">跟读原句：{shadow.reference}</p>
          <p>
            识别文本对照 · 漏词：{aligned.missing.join(", ") || "无"} · 多词：
            {aligned.extra.join(", ") || "无"}
          </p>
          <p>
            替换：
            {aligned.incorrect
              .map((w) => `${w.expected} → ${w.actual}`)
              .join("；") || "无"}{" "}
            · WER {(aligned.wer * 100).toFixed(1)}%
          </p>
          <p className="small muted">
            请先核对识别文本。这只描述词序差异，不判断口音或发音质量。
          </p>
        </div>
      )}
      <button
        className="button secondary"
        disabled={!attempt || !transcript.trim()}
        onClick={() =>
          void update((s) => ({
            ...s,
            drafts: { ...s.drafts, [`speech-notes:${id}`]: transcript },
          })).catch(fail)
        }
      >
        保存核对文本与自评
      </button>
      {state.drafts[`speech-notes:${id}`] && (
        <p className="small">核对文本 / 自评已保存</p>
      )}
      {attempt && transcript.trim().length >= 10 && (
        <AiFeedback
          attempt={attempt}
          exam={exam}
          taskType={mockItem?.questionType ?? prompt?.[2] ?? "Speaking 文本辅助反馈"}
          prompt={mockItem?`${mockItem.context}\n${mockItem.prompt}`:prompt?.[1] ?? recording?.title ?? ""}
          text={transcript}
        />
      )}
    </section>
  );
}
