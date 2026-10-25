"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PracticeItem } from "@/lib/practice-model";
import { listeningAudio } from "@/lib/listening-materials";

export function PracticeOfficialAudio({
  source,
  questionId,
  disabled = false,
}: {
  source: NonNullable<PracticeItem["audio"]>;
  questionId: string;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    let active = true,
      objectUrl = "";
    void listeningAudio(source.audioId)
      .then(async (row) => {
        if (!row)
          throw new Error(
            "本卷原音不在当前设备，请重新导入相同素材或恢复含音频的完整备份。",
          );
        const actual = Array.from(
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", await row.blob.arrayBuffer()),
          ),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        if (actual !== source.audioId)
          throw new Error("本卷原音校验不一致，未播放替代音频，请重新导入。");
        if (!active) return;
        objectUrl = URL.createObjectURL(row.blob);
        setUrl(objectUrl);
        setError("");
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source.audioId]);
  useEffect(() => {
    audio.current?.pause();
  }, [questionId, disabled]);
  useEffect(() => {
    const el = audio.current;
    const pause = () => {
      if (document.hidden) el?.pause();
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      document.removeEventListener("visibilitychange", pause);
      el?.pause();
    };
  }, [url]);
  return (
    <div className="practice-official-audio">
      <p>
        <strong>官方原音 · {source.title}</strong>
      </p>
      <p className="small muted">
        {source.publisher} · 原音约 {Math.ceil(source.duration)} 秒 ·
        官方样例未作难度评级
      </p>
      {url && (
        <audio
          ref={audio}
          controls={!disabled}
          src={url}
          preload="metadata"
          aria-label="小测官方原音"
          onError={() =>
            setError("原音播放失败，题目与答案仍保留，可重新导入后继续。")
          }
        />
      )}
      {!url && !error && <p role="status">正在读取并校验本地原音…</p>}
      {error && (
        <p role="alert">
          {error} <Link href="/listening">打开听力资料库</Link>
        </p>
      )}
      <details>
        <summary>原音来源与使用许可</summary>
        <p>{source.license}</p>
        {source.sourceUrl && (
          <a href={source.sourceUrl} target="_blank" rel="noreferrer">
            查看来源
          </a>
        )}{" "}
        {source.licenseUrl && (
          <a href={source.licenseUrl} target="_blank" rel="noreferrer">
            使用条款
          </a>
        )}
      </details>
    </div>
  );
}
