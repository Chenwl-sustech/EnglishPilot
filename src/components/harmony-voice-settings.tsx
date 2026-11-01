"use client";
import { useEffect, useState } from "react";
import { nativeBuild } from "@/lib/native/runtime";
import { harmonyBridge } from "@/lib/native/harmony-rpc";
import {
  downloadHarmonyVoice,
  harmonyVoiceStatus,
  type HarmonyVoiceStatus,
} from "@/lib/native/harmony-speech";
import { speak, stopPronunciation } from "@/lib/pronunciation";

export function HarmonyVoiceSettings() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<HarmonyVoiceStatus | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function refresh() {
    setError("");
    try {
      setStatus(await harmonyVoiceStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : "本地声音检测失败");
    }
  }
  useEffect(() => {
    if (nativeBuild && harmonyBridge()) {
      setEnabled(true);
      void refresh();
    }
    return () => stopPronunciation();
  }, []);
  useEffect(() => {
    if (!status?.downloading) return;
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [status?.downloading]);
  if (!enabled) return null;
  return (
    <section className="card">
      <h2>鸿蒙本地英语声音</h2>
      <p className="small muted">
        单词、听力和口语老师使用系统离线英语声音。下载声音需要联网，朗读文本留在设备上。
      </p>
      <p role="status">{status?.message ?? "正在检查系统英语声音…"}</p>
      {error && <p role="alert">{error}</p>}
      <div className="button-row">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void refresh()}
        >
          刷新鸿蒙声音
        </button>
        {status?.downloadable && !status.ready && (
          <button
            className="button primary"
            disabled={busy || status.downloading}
            onClick={() => {
              setBusy(true);
              setError("");
              void downloadHarmonyVoice()
                .then(refresh)
                .catch((e) =>
                  setError(e instanceof Error ? e.message : "声音下载失败"),
                )
                .finally(() => setBusy(false));
            }}
          >
            {status.downloading ? "正在下载…" : "下载系统英语声音"}
          </button>
        )}
        {status?.ready && (
          <button
            className="button secondary"
            onClick={() =>
              speak(
                "Daily practice helps us learn to speak clearly.",
                1,
                setError,
              )
            }
          >
            试听鸿蒙英语声音
          </button>
        )}
        <button className="button secondary" onClick={stopPronunciation}>
          停止试听
        </button>
      </div>
    </section>
  );
}
