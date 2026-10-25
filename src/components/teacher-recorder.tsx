"use client";
import { recordingError } from "@/lib/recording-error";
import { useEffect, useRef, useState } from "react";
import { db, mutateWithRecording, type Recording } from "@/lib/db";
import { attachTeacherRecording } from "@/lib/teacher";
import { stopPronunciation } from "@/lib/pronunciation";
import { today } from "@/lib/engine";
import { useStudy } from "./study-context";

export function TeacherAudio({
  id,
  version = 0,
}: {
  id: string;
  version?: number;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      created = "";
    void db.recordings
      .get(id)
      .then((row) => {
        if (!active) return;
        if (!row) {
          setError("此录音不在当前设备，请导入包含音频的完整备份");
          return;
        }
        created = URL.createObjectURL(row.blob);
        setUrl(created);
      })
      .catch(() => {
        if (active) setError("录音读取失败，可稍后重试");
      });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id, version]);
  return url ? (
    <div className="teacher-audio">
      <audio controls src={url} />
      <a
        className="small"
        href={url}
        download={`${id.replace(/[^a-z0-9_-]/gi, "_")}.webm`}
      >
        下载原始录音
      </a>
    </div>
  ) : (
    <p className="small muted">{error || "正在读取录音…"}</p>
  );
}
function PendingAudio({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url ? (
    <div className="teacher-audio">
      <audio controls src={url} />
      <a href={url} download="unsaved-teacher-recording.webm">
        下载待保存录音
      </a>
    </div>
  ) : null;
}
export function TeacherRecorder({
  sessionId,
  draftId,
  disabled,
  onCaptureChange,
}: {
  sessionId: string;
  draftId: string;
  disabled: boolean;
  onCaptureChange: (value: boolean) => void;
}) {
  const { update } = useStudy();
  const [recording, setRecording] = useState(false),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Recording | null>(null),
    [error, setError] = useState(""),
    [seconds, setSeconds] = useState(0),
    [separatelySaved, setSeparatelySaved] = useState(false);
  const mounted = useRef(true),
    recorder = useRef<MediaRecorder | null>(null),
    input = useRef<MediaStream | null>(null),
    timeout = useRef<ReturnType<typeof setTimeout> | null>(null),
    started = useRef(0);
  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop();
      input.current?.getTracks().forEach((t) => t.stop());
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);
  useEffect(() => {
    onCaptureChange(recording || busy || !!pending);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const blockPlayback = (event: Event) => {
      if (event.target instanceof HTMLMediaElement) event.target.pause();
    };
    if (recording || busy)
      document.addEventListener("play", blockPlayback, true);
    if (recording || busy || pending)
      window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("play", blockPlayback, true);
      onCaptureChange(false);
    };
  }, [recording, busy, pending, onCaptureChange]);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(
      () =>
        setSeconds(
          Math.min(
            180,
            Math.floor((performance.now() - started.current) / 1000),
          ),
        ),
      300,
    );
    return () => clearInterval(timer);
  }, [recording]);
  async function save(row: Recording, duration: number, checkpoint = false) {
    if (mounted.current && !checkpoint) {
      setBusy(true);
      setError("");
    }
    try {
      await mutateWithRecording(row, (s) =>
        attachTeacherRecording(s, sessionId, draftId, row.id, duration),
      );
      if (mounted.current && !checkpoint) {
        setPending(null);
        await update((s) => s);
      }
    } catch (e) {
      let message = e instanceof Error ? e.message : "录音保存失败";
      try {
        await db.recordings.put(row);
        message += "；原音已单独保存在口语页面";
        if (mounted.current) setSeparatelySaved(true);
      } catch {
        message += "；请先下载待保存录音";
      }
      if (mounted.current) setError(message);
    } finally {
      if (mounted.current && !checkpoint) setBusy(false);
    }
  }
  async function start() {
    if (busy || recording || disabled) return;
    setBusy(true);
    setError("");
    setSeparatelySaved(false);
    stopPronunciation();
    document.querySelectorAll("audio").forEach((audio) => audio.pause());
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "请在本机 Chrome/Edge 中允许麦克风，当前浏览器不支持录音",
        );
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || disabled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      input.current = stream;
      const r = new MediaRecorder(stream),
        chunks: Blob[] = [],
        id = `teacher-audio-${crypto.randomUUID()}`;
      recorder.current = r;
      let writes = Promise.resolve(),
        lastCheckpoint = -Infinity;
      r.ondataavailable = (e) => {
        if (!e.data.size) return;
        chunks.push(e.data);
        const elapsed = performance.now() - started.current;
        if (elapsed - lastCheckpoint < 1000) return;
        lastCheckpoint = elapsed;
        const row = {
          id,
          blob: new Blob(chunks, { type: r.mimeType }),
          date: today(),
          title: "AI 口语老师对话（可恢复快照）",
        };
        writes = writes.then(() =>
          save(
            row,
            Math.min(180, Math.max(0, Math.floor(elapsed / 1000))),
            true,
          ),
        );
      };
      r.onerror = () => {
        if (mounted.current)
          setError("麦克风发生错误，结束后会尝试保存已取得的音频");
        stop();
      };
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timeout.current) clearTimeout(timeout.current);
        const duration = Math.min(
            180,
            Math.max(
              0,
              Math.floor((performance.now() - started.current) / 1000),
            ),
          ),
          blob = new Blob(chunks, { type: r.mimeType }),
          row = { id, blob, date: today(), title: "AI 口语老师对话" };
        if (mounted.current) {
          setRecording(false);
          setSeconds(duration);
        }
        if (!blob.size) {
          if (mounted.current) setError("没有取得有效音频，请检查麦克风");
          return;
        }
        if (mounted.current) setPending(row);
        void writes.then(() => save(row, duration));
      };
      started.current = performance.now();
      setSeconds(0);
      r.start(250);
      setRecording(true);
      timeout.current = setTimeout(stop, 180000);
    } catch (e) {
      input.current?.getTracks().forEach((t) => t.stop());
      if (mounted.current)
        setError(recordingError(e).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="teacher-recorder">
      <div className="actions">
        <button
          className="button secondary"
          disabled={disabled || busy || recording || !!pending}
          onClick={() => void start()}
        >
          开始对话录音
        </button>
        {recording && (
          <button className="button danger" onClick={stop}>
            结束对话录音
          </button>
        )}
        {pending && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void save(pending, seconds)}
          >
            重试保存对话录音
          </button>
        )}
        {pending && separatelySaved && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setPending(null)}
          >
            保留原音并返回
          </button>
        )}
      </div>
      <p className="small muted">
        {recording
          ? `● 录音中 ${seconds} 秒`
          : busy
            ? "正在保存原始录音…"
            : "每段最多 180 秒，录制中约每秒保存可恢复快照；结束后转写核对。"}
      </p>
      {pending && <PendingAudio blob={pending.blob} />}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
