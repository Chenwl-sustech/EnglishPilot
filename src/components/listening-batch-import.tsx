"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { officialListeningCatalog } from "@/lib/data/official-listening";
import {
  importRunSchema,
  type ListeningImportReceiptInput,
} from "@/lib/listening-import-receipt-model";
import { importFirstOfficialListeningPack } from "@/lib/official-listening-import";
import { StudyProvider, useStudy } from "./study-context";

export function ListeningBatchImport() {
  return (
    <StudyProvider>
      <Suspense fallback={<p role="status">正在打开导入页面…</p>}>
        <ImportRun />
      </Suspense>
    </StudyProvider>
  );
}
function ImportRun() {
  const search = useSearchParams(),
    { update } = useStudy();
  const supplied = search.get("run"),
    parsed = importRunSchema.safeParse(supplied);
  const [manualRun, setManualRun] = useState<string | null>(null),
    [retry, setRetry] = useState(0);
  const run = parsed.success ? parsed.data : manualRun;
  const [progress, setProgress] = useState({
      count: 0,
      title: "准备校验本机官方素材",
    }),
    [error, setError] = useState("");
  const [receipt, setReceipt] = useState<ListeningImportReceiptInput | null>(
    null,
  );
  useEffect(() => {
    if (!run) return;
    const controller = new AbortController();
    let alive = true;
    setError("");
    setReceipt(null);
    void importFirstOfficialListeningPack(run, {
      signal: controller.signal,
      progress: (count, title) => {
        if (alive) setProgress({ count, title });
      },
    })
      .then(async (result) => {
        await update((s) => s);
        if (alive) setReceipt(result);
      })
      .catch((e) => {
        if (alive)
          setError(e instanceof Error ? e.message : "素材导入失败，请重试");
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [run, retry, update]);
  function start() {
    const next = crypto.randomUUID();
    window.history.replaceState(null, "", `/import-listening?run=${next}`);
    setManualRun(next);
  }
  return (
    <main className="batch-import-page">
      <div className="eyebrow">ENGLISHPILOT · OFFICIAL LISTENING</div>
      <h1>导入首批官方听力素材</h1>
      <p className="muted">
        将官方原音、配套原文和题目合并保存到当前浏览器。已存在的素材保留你的标注，已有目标、练习、FSRS状态和录音保持原样。
      </p>
      <section className="panel">
        <h2>本次素材</h2>
        <ul>
          {officialListeningCatalog.map((s) => (
            <li key={s.id}>
              {s.title} ·{" "}
              <a
                className="text-link"
                href={s.pageUrl}
                target="_blank"
                rel="noreferrer"
              >
                {s.publisher}
              </a>
            </li>
          ))}
        </ul>
        <p className="small muted">
          官方公开样题与教学示例，仅按来源条款用于个人学习。配套内容保存在本机，原音校验完成后统一写入资料库。
        </p>
        {supplied && !parsed.success && (
          <p role="alert">导入链接无效，请从听力页面重新进入。</p>
        )}
        {!run && !supplied && (
          <button className="button primary" onClick={start}>
            开始导入首批官方素材
          </button>
        )}
        {run && !receipt && !error && (
          <div role="status">
            <p>
              已校验 {progress.count} / {officialListeningCatalog.length} 段
            </p>
            <p>{progress.title}</p>
            <p className="small muted">
              请保持此页面打开，完成后会显示保存结果。
            </p>
          </div>
        )}
        {error && (
          <>
            <p role="alert">{error}</p>
            <p className="small muted">
              重试会保留已经存在的素材与标注，并重新核对原音。
            </p>
            <button
              className="button primary"
              onClick={() => setRetry((v) => v + 1)}
            >
              重试导入
            </button>
          </>
        )}
        {receipt && (
          <div data-testid="batch-import-result">
            <h2>素材导入完成</h2>
            <p>
              已保存 {receipt.materialIds.length} 段素材，共{" "}
              {receipt.questionCount} 道题。
            </p>
            <p>
              本次新增 {receipt.added} 段，复用 {receipt.retained} 段已有素材。
            </p>
            <p className="small muted">
              音频已从本地资料库读回并通过SHA-256校验，可在完整备份中一并保存。官方未提供逐句时间轴，标注后可使用原音听写与跟读。
            </p>
          </div>
        )}
        <div className="actions">
          <Link className="button secondary" href="/listening?library=imported">
            打开听力资料库
          </Link>
          <Link className="text-link" href="/settings">
            设置与完整备份
          </Link>
        </div>
      </section>
    </main>
  );
}
