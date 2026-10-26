"use client";
import { apiFetch } from "@/lib/native/api";
import { teacherDraftCacheKey } from "@/lib/teacher-draft-cache";
import { nativeBuild } from "@/lib/native/runtime";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import {
  startTeacher,
  setTeacherDraft,
  queueTeacherTurn,
  applyTeacherReply,
  finishTeacher,
  teacherRequest,
  retryTeacherTurn,
  requestTeacherSummary,
  applyTeacherSummary,
  confirmTeacherCorrection,
} from "@/lib/teacher";
import {
  teacherReplySchema,
  type TeacherOptions,
  type TeacherReply,
  type TeacherSession,
} from "@/lib/teacher-model";
import { speak, stopPronunciation } from "@/lib/pronunciation";
import type { Extension } from "@/lib/adaptive-model";
import type { AiQuotaSnapshot } from "@/lib/server/ai-quota";
import { useStudy } from "./study-context";
import { PageHeading } from "./exercises";
import { TeacherComposer } from "./teacher-composer";
import { TeacherAudio } from "./teacher-recorder";

const modes = {
  free: "自由聊天",
  scenario: "情景对话",
  ielts: "IELTS 口语陪练",
  toefl: "TOEFL 2026 采访陪练",
};
type Voice = {
  key: string;
  name: string;
  preference: Extension["voicePreference"];
};
export function SpeakingTeacher() {
  const { state, update, fail } = useStudy();
  const [selected, setSelected] = useState(""),
    [locked, setLocked] = useState(false),
    [options, setOptions] = useState<TeacherOptions>({
      mode: "free",
      feedbackMode: "coach",
      topic: "Daily life and learning",
      maxTurns: 10,
    }),
    [voices, setVoices] = useState<Voice[]>([]),
    [voiceKey, setVoiceKey] = useState(""),
    [voiceError, setVoiceError] = useState(""),
    [autoVoice, setAutoVoice] = useState(false),
    [whisper, setWhisper] = useState(
      nativeBuild
        ? "可直接打字，或回放录音后手工填写回答。朗读使用设备本地声音；录音不上传。"
        : "正在检查本地 Whisper…",
    );
  const sessions = state.extension.teacherSessions,
    session = sessions.find((p) => p.id === selected) ?? sessions.at(-1);
  const preference =
    voices.find((v) => v.key === voiceKey) ??
    voices.find(
      (v) =>
        v.preference.voiceURI === state.extension.voicePreference.voiceURI &&
        v.preference.mode === state.extension.voicePreference.mode,
    ) ??
    voices[0];
  useEffect(() => {
    let active = true;
    const refreshDevice = () => {
      const device =
        window.speechSynthesis
          ?.getVoices()
          .filter((v) => v.localService && /^en[-_]/i.test(v.lang))
          .map((v) => ({
            key: `device:${v.voiceURI}`,
            name: `${v.name} · ${v.lang} · 设备本地`,
            preference: {
              voiceURI: v.voiceURI,
              locale: v.lang,
              mode: "device-local" as const,
            },
          })) ?? [];
      if (active)
        setVoices((old) => [
          ...old.filter((v) => v.preference.mode === "system-local"),
          ...device,
        ]);
    };
    refreshDevice();
    window.speechSynthesis?.addEventListener("voiceschanged", refreshDevice);
    if (!nativeBuild) {
      void apiFetch("/api/tts")
        .then(async (r) => {
          const b = await r.json();
          if (!r.ok) throw new Error(b.error || "本地 WAV 引擎不可用");
          if (active)
            setVoices((old) => [
              ...(b.voices as { id: string; name: string; locale: string }[])
                .filter((v) => /^en[-_]/i.test(v.locale))
                .map((v) => ({
                  key: `system:${v.id}`,
                  name: `${v.name} · ${v.locale} · 本地 WAV`,
                  preference: {
                    voiceURI: v.id,
                    locale: v.locale,
                    mode: "system-local" as const,
                  },
                })),
              ...old.filter((v) => v.preference.mode === "device-local"),
            ]);
        })
        .catch(() => {
          if (active)
            setVoiceError(
              "本地 WAV 语音暂不可用，可检查设置；不会自动改用在线语音",
            );
        });
      void apiFetch("/api/whisper")
        .then(async (r) => {
          const b = await r.json();
          if (!r.ok) throw new Error();
          const m = b.models?.find(
            (m: { name: string; installed: boolean }) =>
              m.name === state.extension.whisperModel,
          );
          if (active)
            setWhisper(
              m?.installed
                ? `本地 Whisper ${m.name} 已安装`
                : `Whisper ${state.extension.whisperModel} 尚未安装，请到口语训练页配置`,
            );
        })
        .catch(() => {
          if (active)
            setWhisper("本地 Whisper 未连接，仍可录音、回放和打字对话");
        });
    }
    return () => {
      active = false;
      stopPronunciation();
      window.speechSynthesis?.removeEventListener(
        "voiceschanged",
        refreshDevice,
      );
    };
  }, [state.extension.whisperModel]);
  async function create() {
    try {
      await update((s) => startTeacher(s, options));
      const row = await db.state.get("main");
      setSelected(row?.value.extension.teacherSessions.at(-1)?.id ?? "");
    } catch (e) {
      fail(e);
    }
  }
  function read(text: string) {
    setVoiceError("");
    if (!preference) {
      setVoiceError("未检测到本地英语声音，请先到设置页配置");
      return;
    }
    speak(text, 1, setVoiceError, preference.preference);
  }
  return (
    <>
      <PageHeading
        eyebrow="SPEAK, REFLECT, TRY AGAIN"
        title="AI 口语老师"
        description={
          nativeBuild
            ? "回放录音、手工填写并核对文字，再与老师继续对话。支持自由交流、情景练习与双考试口语陪练。"
            : "录音、核对转写，再与老师继续对话。支持自由交流、情景练习与双考试口语陪练。"
        }
      />
      <section className="panel teacher-setup">
        <h2>开始一次练习</h2>
        <div className="form-grid">
          <label>
            陪练模式
            <select
              value={options.mode}
              disabled={locked}
              onChange={(e) =>
                setOptions((o) => ({
                  ...o,
                  mode: e.target.value as TeacherOptions["mode"],
                }))
              }
            >
              {Object.entries(modes).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            反馈方式
            <select
              value={options.feedbackMode}
              disabled={locked}
              onChange={(e) =>
                setOptions((o) => ({
                  ...o,
                  feedbackMode: e.target
                    .value as TeacherOptions["feedbackMode"],
                }))
              }
            >
              <option value="coach">边练边纠错</option>
              <option value="exam">结束后统一点评</option>
            </select>
          </label>
          <label>
            练习话题或场景
            <input
              value={options.topic}
              maxLength={300}
              disabled={locked}
              onChange={(e) =>
                setOptions((o) => ({ ...o, topic: e.target.value }))
              }
            />
          </label>
          <label>
            每次最多轮数
            <input
              type="number"
              min={1}
              max={20}
              value={options.maxTurns}
              disabled={locked}
              onChange={(e) =>
                setOptions((o) => ({ ...o, maxTurns: Number(e.target.value) }))
              }
            />
          </label>
        </div>
        <button
          className="button primary"
          disabled={
            locked ||
            !options.topic.trim() ||
            options.maxTurns < 1 ||
            options.maxTurns > 20
          }
          onClick={() => void create()}
        >
          开始新对话
        </button>
        <p className="small muted">
          {whisper}
          {!nativeBuild && (
            <>
              {" "}
              · <Link href="/speaking">管理本地模型</Link>
            </>
          )}
        </p>
      </section>
      <section className="panel teacher-voice">
        <label>
          老师的本地声音
          <select
            value={preference?.key ?? ""}
            onChange={(e) => {
              const v = voices.find((v) => v.key === e.target.value);
              setVoiceKey(e.target.value);
              if (v)
                void update((s) => ({
                  ...s,
                  extension: { ...s.extension, voicePreference: v.preference },
                })).catch(fail);
            }}
          >
            <option value="" disabled>
              选择实际可用的声音
            </option>
            {voices.map((v) => (
              <option key={v.key} value={v.key}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="teacher-checkbox">
          <input
            type="checkbox"
            checked={autoVoice}
            onChange={(e) => setAutoVoice(e.target.checked)}
          />
          自动朗读老师的新回复
        </label>
        <button
          className="button secondary"
          onClick={() => {
            stopPronunciation();
          }}
        >
          停止朗读
        </button>
        {voiceError && <p role="alert">{voiceError}</p>}
      </section>
      {sessions.length > 0 && (
        <section className="panel teacher-history">
          <label>
            对话历史
            <select
              disabled={locked}
              value={session?.id}
              onChange={(e) => {
                stopPronunciation();
                setSelected(e.target.value);
              }}
            >
              {[...sessions].reverse().map((p) => (
                <option key={p.id} value={p.id}>
                  {p.date} · {modes[p.mode]} · {p.topic} · {p.turns.length}/
                  {p.maxTurns}轮 · {p.status === "active" ? "可继续" : "已结束"}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}
      {session && (
        <TeacherWorkspace
          key={session.id}
          session={session}
          onLock={setLocked}
          read={read}
          autoVoice={autoVoice}
        />
      )}
      <p className="small muted teacher-disclaimer">
        这是 AI 语言陪练，非官方考试评价；没有可靠声学依据时不评分发音。TOEFL
        当前为采访对话练习，严格计时的跟读任务请使用模拟考试。对话与原始录音包含在设置页的完整备份中。
      </p>
    </>
  );
}
function TeacherWorkspace({
  session: p,
  onLock,
  read,
  autoVoice,
}: {
  session: TeacherSession;
  onLock: (v: boolean) => void;
  read: (text: string) => void;
  autoVoice: boolean;
}) {
  const { update, fail } = useStudy();
  const [busy, setBusy] = useState(false),
    [capturing, setCapturing] = useState(false),
    [error, setError] = useState(""),
    [usage, setUsage] = useState<AiQuotaSnapshot | null>(null);
  const mounted = useRef(true);
  const pending = p.turns.at(-1)?.response === null ? p.turns.at(-1) : null;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    onLock(busy || capturing);
    return () => onLock(false);
  }, [busy, capturing, onLock]);
  useEffect(() => {
    let active = true;
    void apiFetch("/api/ai-usage")
      .then(async (r) => {
        if (r.ok && active) setUsage(await r.json());
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [busy]);
  async function send(
    action: "turn" | "summary",
    text?: string,
    fresh = false,
  ) {
    if (busy || capturing) return false;
    let queued = false;
    setBusy(true);
    setError("");
    stopPronunciation();
    try {
      if (action === "summary")
        await update((s) => requestTeacherSummary(s, p.id, fresh));
      else if (typeof text === "string")
        await update((s) =>
          queueTeacherTurn(
            setTeacherDraft(s, p.id, p.draft.id, text),
            p.id,
            p.draft.id,
          ),
        );
      else if (fresh && pending)
        await update((s) => retryTeacherTurn(s, p.id, pending.id));
      const saved = (await db.state.get("main"))?.value;
      if (!saved) throw new Error("学习数据尚未加载");
      queued = true;
      const input = teacherRequest(saved, p.id, action),
        turn = saved.extension.teacherSessions
          .find((row) => row.id === p.id)!
          .turns.at(-1)!;
      const response = await apiFetch("/api/teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(75000),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "AI 回复失败");
      const feedback = teacherReplySchema.parse(body);
      await update((s) =>
        action === "summary"
          ? applyTeacherSummary(s, p.id, input.requestId, feedback)
          : applyTeacherReply(s, p.id, turn.id, input.requestId, feedback),
      );
      if (mounted.current && autoVoice) read(feedback.reply);
      return true;
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "网络中断或请求失败；回答与录音已保存，可获取已保存结果",
        );
      return queued;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function finish() {
    try {
      const key = teacherDraftCacheKey(db.name, p.id, p.draft.id);
      let text: string | null = null;
      try {
        text = localStorage.getItem(key);
      } catch {}
      await update((s) =>
        finishTeacher(
          text !== null && !pending
            ? setTeacherDraft(s, p.id, p.draft.id, text)
            : s,
          p.id,
        ),
      );
    } catch (e) {
      fail(e);
    }
  }
  return (
    <div className="teacher-workspace" aria-busy={busy}>
      <section className="panel">
        <div className="section-line">
          <h2>
            {modes[p.mode]} · {p.topic}
          </h2>
          <span className="tag">
            {p.turns.length}/{p.maxTurns}轮
          </span>
        </div>
        <p className="small muted">
          {usage
            ? `今日 AI 剩余 ${usage.calls.remaining} 次（对话、批改和总结共用），token 剩余 ${usage.tokens.remaining.toLocaleString()}`
            : "AI 额度以设置页的本机账本为准"}{" "}
          · 每次回复与结束点评均计入额度。
        </p>
        <article className="teacher-message teacher-message-assistant">
          <strong>老师</strong>
          <p>{p.opening}</p>
          <button
            className="button secondary"
            disabled={busy || capturing}
            onClick={() => read(p.opening)}
          >
            朗读开场问题
          </button>
        </article>
        {p.turns.map((t, index) => (
          <div key={t.id} className="teacher-exchange">
            <article className="teacher-message teacher-message-user">
              <strong>你 · 第 {index + 1} 轮</strong>
              <p>{t.text}</p>
              {t.recordingId && (
                <TeacherAudio id={t.recordingId} version={t.audioRevision} />
              )}
            </article>
            {t.response && (
              <TeacherFeedback
                sessionId={p.id}
                sourceId={t.id}
                value={t.response}
                read={read}
                disabled={busy || capturing}
              />
            )}
          </div>
        ))}
        {busy && <p role="status">正在获取老师回复…</p>}
        {pending && (
          <div className="teacher-pending">
            <p>
              上一条回答已保存。获取结果会复用原请求编号；只有明确重新发送才创建新的
              AI 请求。
            </p>
            <div className="actions">
              <button
                className="button primary"
                disabled={busy || capturing}
                onClick={() => void send("turn")}
              >
                获取已保存回复
              </button>
              <button
                className="button secondary"
                disabled={busy || capturing}
                onClick={() => void send("turn", undefined, true)}
              >
                重新发送（消耗新额度）
              </button>
            </div>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        {p.status === "active" ? (
          <button
            className="button secondary"
            disabled={busy || capturing}
            onClick={() => void finish()}
          >
            结束本次对话
          </button>
        ) : (
          <p>本次对话已结束</p>
        )}
      </section>
      {p.status === "active" && !pending && (
        <TeacherComposer
          key={p.draft.id}
          session={p}
          disabled={busy}
          onSend={(text) => send("turn", text)}
          onCaptureChange={setCapturing}
        />
      )}
      {p.status === "completed" && (
        <section className="panel teacher-summary">
          <h2>结束点评</h2>
          {p.summary ? (
            <TeacherFeedback
              sessionId={p.id}
              sourceId="summary"
              value={p.summary}
              read={read}
              disabled={busy || capturing}
            />
          ) : (
            <>
              <p className="small muted">
                根据本次实际回答生成语言改进建议，会单独使用一次 AI 额度。
              </p>
              <div className="actions">
                <button
                  className="button primary"
                  disabled={busy || capturing || !p.turns.length}
                  onClick={() => void send("summary")}
                >
                  {p.summaryRequestId ? "获取已保存点评" : "生成结束点评"}
                </button>
                {p.summaryRequestId && (
                  <button
                    className="button secondary"
                    disabled={busy || capturing}
                    onClick={() => void send("summary", undefined, true)}
                  >
                    重新生成点评（消耗新额度）
                  </button>
                )}
              </div>
            </>
          )}
          {(p.draft.text || p.draft.recordingId) && (
            <details>
              <summary>结束时保留的未提交草稿</summary>
              <p>{p.draft.text}</p>
              {p.draft.recordingId && <TeacherAudio id={p.draft.recordingId} />}
            </details>
          )}
        </section>
      )}
    </div>
  );
}
function TeacherFeedback({
  sessionId,
  sourceId,
  value,
  read,
  disabled,
}: {
  sessionId: string;
  sourceId: string;
  value: TeacherReply;
  read: (text: string) => void;
  disabled: boolean;
}) {
  const { update, notify, fail } = useStudy();
  async function confirm(index: number) {
    try {
      await update((s) =>
        confirmTeacherCorrection(s, sessionId, sourceId, index),
      );
      notify("已确认并加入错题复习");
    } catch (e) {
      fail(e);
    }
  }
  return (
    <article className="teacher-message teacher-message-assistant">
      <strong>老师 · AI 回复</strong>
      <p>{value.reply}</p>
      {(value.warnings ?? []).map((warning, index) => (
        <p className="small muted" key={index}>
          {warning}
        </p>
      ))}
      <button
        className="button secondary"
        disabled={disabled}
        onClick={() => read(value.reply)}
      >
        朗读这条回复
      </button>
      {value.corrections.map((c, index) => (
        <div className="teacher-correction" key={`${c.original}:${index}`}>
          <span className="tag">{c.category}</span>
          <p>
            <del>{c.original}</del> → <strong>{c.better}</strong>
          </p>
          <p>{c.explanation}</p>
          <button
            className="button secondary"
            disabled={disabled}
            onClick={() => void confirm(index)}
          >
            确认此纠错并加入复习
          </button>
        </div>
      ))}
      {value.suggestions.length > 0 && (
        <ul>
          {value.suggestions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
