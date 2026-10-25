"use client";
import { recordingError } from "@/lib/recording-error";
import { useEffect, useRef, useState } from "react";
import { db, mutateWithRecording } from "@/lib/db";
import { attachPracticeRecording } from "@/lib/practice";
import type { PracticeItem } from "@/lib/practice-model";
import { today } from "@/lib/engine";
import { useStudy } from "./study-context";

export function PracticeAudio({ id }: { id: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true,
      created = "";
    void db.recordings.get(id).then((r) => {
      if (alive && r) {
        created = URL.createObjectURL(r.blob);
        setUrl(created);
      }
    });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id]);
  return url ? (
    <div>
      <audio controls src={url} />
      <a href={url} download={`${id.replace(/[^a-z0-9_-]/gi, "_")}.webm`}>
        下载原始录音
      </a>
    </div>
  ) : (
    <p className="small muted">正在读取录音；旧版JSON不包含其他设备的音频。</p>
  );
}
export function PracticeRecorder({
  sessionId,
  item,
  recordingId,
  disabled,
  onCaptureChange,
}: {
  sessionId: string;
  item: PracticeItem;
  recordingId?: string;
  disabled: boolean;
  onCaptureChange: (capturing: boolean) => void;
}) {
  const { update, notify, fail } = useStudy();
  const [recording, setRecording] = useState(false),
    [pending, setPending] = useState<Blob | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [prepare, setPrepare] = useState(item.preparationSeconds);
  const [preparing, setPreparing] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const pendingId = useRef("");
  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (stopTimer.current) clearTimeout(stopTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!disabled) return;
    stop();
  }, [disabled]);
  useEffect(() => {
    onCaptureChange(recording || !!pending || busy);
    return () => onCaptureChange(false);
  }, [recording, pending, busy, onCaptureChange]);
  useEffect(() => {
    if (!preparing) return;
    const end = performance.now() + item.preparationSeconds * 1000;
    const timer = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((end - performance.now()) / 1000),
      );
      setPrepare(remaining);
      if (!remaining) setPreparing(false);
    }, 200);
    return () => clearInterval(timer);
  }, [preparing, item.preparationSeconds]);
  async function start() {
    setError("");
    setBusy(true);
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "此浏览器不支持录音，请使用本机Chrome/Edge并允许麦克风权限",
        );
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || disabled) {
        input.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = input;
      const r = new MediaRecorder(input),
        chunks: Blob[] = [];
      recorder.current = r;
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onerror = () => setError("录音设备异常，已产生的音频将在结束时保留");
      r.onstop = () => {
        input.getTracks().forEach((t) => t.stop());
        if (stopTimer.current) clearTimeout(stopTimer.current);
        const blob = new Blob(chunks, { type: r.mimeType });
        if (mounted.current) setRecording(false);
        if (blob.size) {
          if (mounted.current) setPending(blob);
          void saveBlob(blob);
        } else if (mounted.current)
          setError("未取得有效音频，请重试；已有录音未更改");
      };
      pendingId.current = `exam-audio-${crypto.randomUUID()}`;
      setPending(null);
      r.start(250);
      setRecording(true);
      stopTimer.current = setTimeout(
        () => r.state === "recording" && r.stop(),
        Math.max(1, item.responseSeconds || 120) * 1000,
      );
    } catch (e) {
      setError(recordingError(e).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function saveBlob(blob: Blob) {
    if (mounted.current) {
      setBusy(true);
      setError("");
    }
    const id = pendingId.current || `exam-audio-${crypto.randomUUID()}`,
      row = { id, blob, date: today(), title: `模考 · ${item.questionType}` };
    try {
      await mutateWithRecording(row, (s) =>
        attachPracticeRecording(s, sessionId, item.id, id),
      );
      await update((s) => s);
      if (mounted.current) setPending(null);
      notify("模考录音已保存");
    } catch (e) {
      let message = e instanceof Error ? e.message : "录音保存失败";
      try {
        await db.recordings.put(row);
        message += "；原始录音已单独保存在口语页面";
      } catch {
        message += "；请先下载当前录音";
      }
      if (mounted.current) setError(message);
      fail(new Error(message));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="practice-recorder">
      <p className="small muted">
        准备 {item.preparationSeconds} 秒 · 单次录音上限{" "}
        {item.responseSeconds || 120}{" "}
        秒。结束后自动保存原始录音；转写和AI反馈可在交卷后单独发起。
      </p>
      {item.preparationSeconds > 0 && prepare > 0 && (
        <button
          className="button secondary"
          disabled={preparing || disabled}
          onClick={() => setPreparing(true)}
        >
          {preparing ? `准备中 ${prepare} 秒` : "开始准备计时"}
        </button>
      )}
      <div className="actions">
        <button
          className="button primary"
          disabled={disabled || recording || busy || !!pending || prepare > 0}
          onClick={() => void start()}
        >
          开始模考录音
        </button>
        {recording && (
          <button className="button danger" onClick={stop}>
            结束模考录音
          </button>
        )}
        {pending && (
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void saveBlob(pending)}
          >
            {busy ? "正在保存录音…" : "重试保存本题录音"}
          </button>
        )}
      </div>
      {recording && (
        <p role="status">● 正在录制本题，结束后请保存录音再切换题目。</p>
      )}
      {pending && <PendingAudio blob={pending} />}
      {recordingId && <PracticeAudio id={recordingId} />}
      {error && <p role="alert">{error}</p>}
    </div>
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
    <div>
      <audio controls src={url} />
      <a href={url} download="unsaved-exam-recording.webm">
        下载待保存录音
      </a>
    </div>
  ) : null;
}
