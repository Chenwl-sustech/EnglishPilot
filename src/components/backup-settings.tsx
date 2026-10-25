"use client";
import { useRef, useState } from "react";
import { Download, Upload, ShieldCheck } from "lucide-react";
import { useStudy } from "./study-context";
import { db, exportFullBackup, restoreBackup } from "@/lib/db";
import { decodeBackup, type BackupContents } from "@/lib/backup";
import { today } from "@/lib/engine";
import type { State } from "@/lib/model";
import { saveExport } from "@/lib/native/files";

export function BackupSettings({
  onRestored,
}: {
  onRestored: (state: State) => void;
}) {
  const { state, notify, fail } = useStudy();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<BackupContents | null>(null);
  const file = useRef<HTMLInputElement>(null);
  async function download(complete: boolean) {
    setBusy(true);
    try {
      const blob = complete
        ? await exportFullBackup()
        : new Blob(
            [JSON.stringify((await db.state.get("main"))?.value ?? state)],
            { type: "application/json" },
          );
      const exported = await saveExport(blob, `englishpilot-${today()}.${complete ? "epbackup" : "json"}`);
      if (exported === "canceled") {
        notify("已取消导出，原学习记录与录音未更改");
        return;
      }
      notify(
        complete
          ? "完整备份已导出，包含学习数据、原始录音与导入素材音频"
          : "JSON 已导出，不包含录音；推荐同时保留完整备份",
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function inspect(input: File | undefined) {
    if (!input) return;
    setBusy(true);
    setPreview(null);
    try {
      setPreview(await decodeBackup(input));
    } catch (e) {
      fail(
        new Error(
          `备份校验失败：${e instanceof Error ? e.message : "文件损坏"}。原数据未更改。`,
        ),
      );
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }
  async function restore() {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const next = await restoreBackup(preview);
      onRestored(next);
      setPreview(null);
      notify("备份已恢复");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel backup-panel">
      <div className="section-line">
        <div>
          <span className="eyebrow">YOUR DATA, ON YOUR DEVICE</span>
          <h2>本地数据与备份</h2>
        </div>
        <ShieldCheck size={26} />
      </div>
      <p className="muted">
        完整备份包含目标、计划、练习、错题、草稿、FSRS状态、全部原始录音和导入素材音频。文件保存在你的设备，导入前会核验清单与每段音频的
        SHA-256；校验失败不会改动当前数据。上限512
        MB。AI服务端密钥及额度账本不包含在学习备份中。
      </p>
      <div className="actions">
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void download(true)}
        >
          <Download size={16} />
          导出完整备份（含录音）
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void download(false)}
        >
          导出 JSON 备份
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => file.current?.click()}
        >
          <Upload size={16} />
          选择备份文件
        </button>
        <input
          ref={file}
          type="file"
          hidden
          accept=".epbackup,.json,application/json,application/octet-stream"
          aria-label="导入 JSON 备份或完整备份"
          onChange={(e) => void inspect(e.target.files?.[0])}
        />
      </div>
      {busy && <p role="status">正在校验或保存备份，请保持页面打开…</p>}
      {preview && (
        <div className="import-preview">
          <h3>校验通过，确认恢复内容</h3>
          <p>
            {preview.state.profile.name} · {preview.state.attempts.length}{" "}
            条练习 · 每天 {preview.state.settings.dailyMinutes} 分钟
          </p>
          {preview.format === "complete" && (
            <p>
              {preview.listeningAudio
                ? `包含 ${preview.listeningAudio.length} 段素材音频（${(preview.listeningAudio.reduce((n, r) => n + r.blob.size, 0) / 1024 / 1024).toFixed(2)} MB），将与学习数据和录音一起恢复。`
                : "此旧版完整备份不含素材音频，将保留当前素材文件。"}
            </p>
          )}
          <p>
            {preview.format === "complete"
              ? `包含 ${preview.recordings!.length} 段录音（${(preview.recordings!.reduce((n, r) => n + r.blob.size, 0) / 1024 / 1024).toFixed(2)} MB）。恢复将原子替换当前学习数据和录音，请先导出当前完整备份。`
              : "这是旧版 JSON：将替换学习记录，保留当前录音。文件本身不包含录音，无法补回其他设备的音频。"}
          </p>
          <div className="actions">
            <button
              className="button danger"
              disabled={busy}
              onClick={() => void restore()}
            >
              确认替换并恢复
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
