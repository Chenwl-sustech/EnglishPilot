"use client";
import { apiFetch } from "@/lib/native/api";

import { useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";
import { setTeacherDraft } from "@/lib/teacher";
import type { TeacherSession } from "@/lib/teacher-model";
import { speechAnalysisSchema } from "@/lib/adaptive-model";
import { isHostedWebClient } from "@/lib/deployment";
import { useStudy } from "./study-context";
import { TeacherAudio, TeacherRecorder } from "./teacher-recorder";

function cached(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function TeacherComposer({
  session,
  disabled,
  onSend,
  onCaptureChange,
}: {
  session: TeacherSession;
  disabled: boolean;
  onSend: (text: string) => Promise<boolean>;
  onCaptureChange: (value: boolean) => void;
}) {
  const { state, update } = useStudy(),
    draft = session.draft,
    key = `teacher-draft:${session.id}:${draft.id}`;
  const [text, setText] = useState(() => cached(key) ?? draft.text),
    [error, setError] = useState(""),
    [transcribing, setTranscribing] = useState(false),
    [saved, setSaved] = useState(cached(key) === null),
    [capturing, setCapturing] = useState(false);
  const local = useRef(text),
    revision = useRef(0),
    dirty = useRef(cached(key) !== null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty.current) {
      local.current = draft.text;
      setText(draft.text);
    }
  }, [draft.text]);
  function edit(value: string) {
    local.current = value;
    revision.current++;
    dirty.current = true;
    setSaved(false);
    setText(value);
    try {
      localStorage.setItem(key, value);
    } catch {
      setError("临时草稿缓存不可用，请保持页面打开并及时提交");
    }
  }
  useEffect(() => {
    if (!dirty.current) return;
    const rev = revision.current;
    const timer = setTimeout(() => {
      void update(
        (s) => {
          const p = s.extension.teacherSessions.find(
            (p) => p.id === session.id,
          );
          return p?.draft.id === draft.id &&
            p.status === "active" &&
            !p.turns.some((t) => !t.response)
            ? setTeacherDraft(s, session.id, draft.id, local.current)
            : s;
        },
        { silent: true },
      )
        .then(() => {
          if (rev === revision.current) {
            dirty.current = false;
            try {
              localStorage.removeItem(key);
            } catch {}
            if (mounted.current) setSaved(true);
          }
        })
        .catch(() => {
          if (mounted.current)
            setError("草稿尚未写入学习数据库，当前文字保留在页面缓存中");
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [text, update, key, session.id, draft.id]);
  useEffect(() => {
    onCaptureChange(capturing || transcribing);
    return () => onCaptureChange(false);
  }, [capturing, transcribing, onCaptureChange]);
  async function transcribe() {
    if (isHostedWebClient) {
      setError(
        "网页版不提供设备本地转写；录音保留在当前浏览器，可回放并手工填写回答。",
      );
      return;
    }
    setError("");
    setTranscribing(true);
    const initialRevision = revision.current;
    try {
      const recording = draft.recordingId
        ? await db.recordings.get(draft.recordingId)
        : null;
      if (!recording) throw new Error("当前设备没有此录音，请导入完整备份");
      const r = await apiFetch(
        `/api/whisper?model=${state.extension.whisperModel}`,
        {
          method: "POST",
          headers: {
            "Content-Type": recording.blob.type || "application/octet-stream",
          },
          body: recording.blob,
          signal: AbortSignal.timeout(190000),
        },
      );
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "本地转写失败");
      const analysis = speechAnalysisSchema.parse({
        ...body,
        id: crypto.randomUUID(),
        recordingId: recording.id,
        createdAt: new Date().toISOString(),
      });
      await update((s) => ({
        ...s,
        extension: {
          ...s.extension,
          speechAnalyses: [...s.extension.speechAnalyses, analysis],
        },
      }));
      if (mounted.current && revision.current === initialRevision)
        edit(analysis.text.slice(0, 4000));
    } catch (e) {
      if (mounted.current)
        setError(
          `${e instanceof Error ? e.message : "转写失败"}。原始录音已保留，可回放并手工填写。`,
        );
    } finally {
      if (mounted.current) setTranscribing(false);
    }
  }
  async function send() {
    if (disabled || capturing || transcribing) return;
    if (await onSend(local.current)) {
      try {
        localStorage.removeItem(key);
      } catch {}
    }
  }
  return (
    <section className="teacher-composer panel">
      <h3>你的下一轮回答</h3>
      <TeacherRecorder
        sessionId={session.id}
        draftId={draft.id}
        disabled={disabled || transcribing}
        onCaptureChange={setCapturing}
      />
      {draft.recordingId && (
        <>
          <TeacherAudio
            key={draft.recordingId}
            id={draft.recordingId}
            version={draft.audioRevision}
          />
          <button
            className="button secondary"
            disabled={
              isHostedWebClient || disabled || capturing || transcribing
            }
            onClick={() => void transcribe()}
          >
            {isHostedWebClient
              ? "网页版暂不支持本地转写"
              : transcribing
                ? "本地转写中…"
                : "本地转写此录音"}
          </button>
        </>
      )}
      <label>
        核对并编辑你的回答
        <textarea
          aria-label="核对并编辑你的回答"
          rows={5}
          maxLength={4000}
          value={text}
          disabled={disabled || transcribing || capturing}
          onChange={(e) => edit(e.target.value)}
        />
      </label>
      <div className="section-line">
        <span className="small muted">
          {saved ? "草稿已保存" : "正在保存草稿…"} · {text.length}/4000
        </span>
        <button
          className="button primary"
          disabled={disabled || capturing || transcribing || !text.trim()}
          onClick={() => void send()}
        >
          发送回答
        </button>
      </div>
      <p className="small muted">
        点击发送时，仅把核对后的文字及本次对话上下文交给已配置的
        AI；录音留在本机。可直接打字练习，打字不计为录音时长。
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
