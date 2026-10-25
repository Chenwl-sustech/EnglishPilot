"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { officialListeningCatalog } from "@/lib/data/official-listening";
import {
  importListeningMaterial,
  prepareListeningImport,
  type PreparedListeningImport,
} from "@/lib/listening-materials";
import { useStudy } from "./study-context";
import { listeningAudioDuration as durationOf } from "@/lib/listening-audio";
import { prepareOfficialListeningSource } from "@/lib/official-listening-import";
import { nativeBuild } from "@/lib/native/runtime";

const template = JSON.stringify(
  {
    title: "我的听力素材",
    exam: "ielts",
    publisher: "个人收藏",
    sourceUrl: "",
    license: "本人有权用于个人学习；未经许可不分享",
    transcript: "",
    duration: 1,
    segments: [],
    questions: [],
  },
  null,
  2,
);
export function ListeningImportPanel({
  onImported,
  disabled = false,
}: {
  onImported: (id: string) => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const { update, notify } = useStudy();
  const [raw, setRaw] = useState(template),
    [file, setFile] = useState<File | null>(null),
    [prepared, setPrepared] = useState<PreparedListeningImport | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [previewUrl, setPreviewUrl] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!prepared) {
      setPreviewUrl("");
      return;
    }
    const u = URL.createObjectURL(prepared.audio.blob);
    setPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [prepared]);
  async function preview(id?: string) {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    setPrepared(null);
    try {
      let next: PreparedListeningImport;
      if (id) {
        const source = officialListeningCatalog.find((s) => s.id === id);
        if (!source) throw new Error("未知官方来源");
        next = await prepareOfficialListeningSource(source);
      } else {
        if (!file) throw new Error("请先选择个人音频文件");
        if (file.size > 128 * 1024 * 1024) throw new Error("音频超过128 MB");
        if (new Blob([raw]).size > 2 * 1024 * 1024)
          throw new Error("素材清单超过2 MB");
        const metadata = JSON.parse(raw);
        const duration = await durationOf(file);
        next = await prepareListeningImport({ ...metadata, duration }, file);
      }
      if (alive.current) setPrepared(next);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "无法预览素材");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function confirm() {
    if (!prepared || busy || disabled) return;
    setBusy(true);
    setError("");
    try {
      await importListeningMaterial(prepared);
      await update((s) => s);
      onImported(prepared.material.id);
      setPrepared(null);
      notify("素材和原音已保存到本设备；重复音频保留原有标注");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，原数据未更改");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel listening-import">
      <h3>导入听力素材</h3>
      <p className="small muted">
        官方目录为公开样题和教学示例，按来源条款仅供个人学习。下载后本机保存原音；个人文件不会上传。每段音频上限
        128 MB、2 小时。
      </p>
      {nativeBuild && <p className="small muted">安装版暂不支持自动下载官方素材。请从下方官方来源保存音频，再通过“个人音频与素材清单”导入设备文件。</p>}
      {!nativeBuild && <div className="actions">
        <button
          className="button primary"
          disabled={busy || disabled}
          onClick={() =>
            router.push(`/import-listening?run=${crypto.randomUUID()}`)
          }
        >
          批量导入首批官方素材
        </button>
      </div>}
      <details>
        <summary>官方样题目录 · IELTS / TOEFL 2026</summary>
        <div className="material-source-grid">
          {officialListeningCatalog.map((s) => (
            <article key={s.id}>
              <h4>{s.title}</h4>
              <p className="small muted">
                {s.publisher} · {Math.ceil(s.duration)} 秒 · {s.version}
              </p>
              <p className="small">{s.note}</p>
              <div className="actions">
                <a
                  className="text-link"
                  target="_blank"
                  rel="noreferrer"
                  href={s.pageUrl}
                >
                  官方来源
                </a>
                <a
                  className="text-link"
                  target="_blank"
                  rel="noreferrer"
                  href={s.transcriptUrl}
                >
                  原文与题目
                </a>
                <a
                  className="text-link"
                  target="_blank"
                  rel="noreferrer"
                  href={s.termsUrl}
                >
                  使用条款
                </a>
              </div>
              {!nativeBuild && <button
                className="button secondary"
                disabled={busy || disabled}
                onClick={() => void preview(s.id)}
              >
                预览 {s.title}
              </button>}
            </article>
          ))}
        </div>
      </details>
      <details>
        <summary>个人音频与素材清单</summary>
        <label>
          个人音频文件
          <input
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.webm"
            disabled={busy || disabled}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPrepared(null);
            }}
          />
        </label>
        <label>
          读取素材清单文件
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy || disabled}
            onChange={async (e) => {
              try {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 2 * 1024 * 1024)
                  throw new Error("素材清单超过2 MB");
                setRaw(await f.text());
                setPrepared(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : "读取失败");
              }
            }}
          />
        </label>
        <label>
          素材清单 JSON
          <textarea
            rows={8}
            value={raw}
            disabled={busy || disabled}
            onChange={(e) => {
              setRaw(e.target.value);
              setPrepared(null);
            }}
          />
        </label>
        <p className="small muted">
          duration 会以实际音频时长为准。segments 为按秒标注的
          id/start/end/text/translation；questions 支持 choice 或 text，包含
          id/questionType/prompt/options/answers/explanation。未标注时间轴时仍可整段练习。
        </p>
        <button
          className="button secondary"
          disabled={busy || disabled}
          onClick={() => void preview()}
        >
          预览个人素材
        </button>
      </details>
      {busy && <p role="status">正在校验音频、来源或保存素材…</p>}
      {error && <p role="alert">{error}</p>}
      {prepared && (
        <div className="import-preview" data-testid="listening-import-preview">
          <h4>{prepared.material.title}</h4>
          <p>
            {prepared.material.origin === "official-sample"
              ? "官方公开样题"
              : "个人导入"}{" "}
            · {prepared.material.exam.toUpperCase()} ·{" "}
            {prepared.material.duration.toFixed(1)} 秒 ·{" "}
            {prepared.material.questions.length} 道题 ·{" "}
            {prepared.material.segments.length} 个已标注片段
          </p>
          <p className="small">
            {prepared.material.publisher} · {prepared.material.license}
          </p>
          {previewUrl && (
            <audio controls src={previewUrl} aria-label="导入原音预览" />
          )}
          <div className="actions">
            <button
              className="button primary"
              disabled={busy || disabled}
              onClick={() => void confirm()}
            >
              确认导入到本机
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setPrepared(null)}
            >
              取消导入
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
